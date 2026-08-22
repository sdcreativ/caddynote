import { scheduleExclusiveCron } from './cronLock.js';
import { prisma } from './prisma.js';
import { sendCommunication, pickPreferredChannel } from './communications.js';
import type { StrkAssignment, StrkAssignmentReminderType } from '@prisma/client';

/**
 * PED-005 : rappels de devoir — publication, échéance proche, retard.
 * Notifie l'élève et les responsables actifs qui acceptent les communications
 * (ELV-002 `canReceiveCommunications`). Un seul envoi de chaque type par élève
 * (garde `strk_assignment_reminders`) ; les parents sont notifiés au même
 * moment, jamais à chaque passage du cron.
 */

const getDueSoonHours = (): number => {
  const configured = Number(process.env.ASSIGNMENT_DUE_SOON_HOURS);
  return Number.isFinite(configured) && configured > 0 ? configured : 24;
};

/** Roster = élèves de la classe du cours porteur du devoir. Un cours sans
 * classe rattachée n'a personne à notifier (pas une erreur — certains cours
 * n'ont pas encore de classe assignée). */
const getRoster = async (courseId: string): Promise<{ id: string }[]> => {
  const course = await prisma.strkCourse.findUnique({ where: { id: courseId }, select: { classId: true } });
  if (!course?.classId) return [];
  return prisma.strkStudent.findMany({ where: { classId: course.classId }, select: { id: true } });
};

const buildContent = (assignment: StrkAssignment, type: StrkAssignmentReminderType) => {
  const dueDate = assignment.dueDate.toLocaleDateString('fr-FR');
  if (type === 'published') {
    return { subject: 'Nouveau devoir', body: `Un nouveau devoir « ${assignment.title} » a été publié, à rendre pour le ${dueDate}.` };
  }
  if (type === 'due_soon') {
    return { subject: 'Devoir à rendre bientôt', body: `Rappel : le devoir « ${assignment.title} » est à rendre le ${dueDate}.` };
  }
  return { subject: 'Devoir en retard', body: `Le devoir « ${assignment.title} » est en retard — échéance dépassée le ${dueDate}.` };
};

/** Envoie (si pas déjà fait) le rappel `type` à un élève pour un devoir
 * donné, et journalise la garde anti-doublon. `skipped` = déjà traité ;
 * `sent` = canal joignable et envoi OK. */
const notifyStudentOnce = async (
  assignment: StrkAssignment,
  studentId: string,
  type: StrkAssignmentReminderType
): Promise<{ skipped: boolean; sent: boolean }> => {
  const existing = await prisma.strkAssignmentReminder.findUnique({
    where: { assignmentId_studentId_type: { assignmentId: assignment.id, studentId, type } },
  });
  if (existing) return { skipped: true, sent: false };

  const student = await prisma.strkProfile.findUnique({
    where: { id: studentId },
    select: { id: true, phoneNumber: true, email: true },
  });
  let sent = false;
  if (student) {
    const preferenceRows = await prisma.strkCommunicationPreference.findMany({ where: { profileId: student.id } });
    const preferences = new Map(preferenceRows.map((p) => [p.channel, p.optedIn]));
    const channel = pickPreferredChannel(student, preferences);
    const { subject, body } = buildContent(assignment, type);
    const result = await sendCommunication({
      recipientId: student.id,
      channel,
      useCase: `assignment_${type}`,
      locale: 'fr',
      variables: { title: assignment.title, dueDate: assignment.dueDate.toLocaleDateString('fr-FR') },
      subject,
      body,
      isCritical: type !== 'published',
      requestedBy: assignment.teacherId,
    });
    sent = result.ok;
  }

  // La garde anti-doublon est posée même si l'envoi a échoué (compte
  // introuvable, canal non configuré...) — sinon un devoir dont l'élève n'a
  // pas d'adresse joignable serait re-tenté indéfiniment à chaque exécution,
  // pour un résultat qui ne changera pas.
  await prisma.strkAssignmentReminder.create({ data: { assignmentId: assignment.id, studentId, type } }).catch(() => {});
  return { skipped: false, sent };
};

/** Rappels parents (publication, échéance, retard) — une fois, avec l’élève. */
const notifyGuardiansOnce = async (
  assignment: StrkAssignment,
  studentId: string,
  type: StrkAssignmentReminderType
): Promise<number> => {
  const links = await prisma.strkStudentGuardian.findMany({
    where: { studentId, status: 'active', canReceiveCommunications: true },
    select: { guardianId: true },
  });
  if (links.length === 0) return 0;

  const student = await prisma.strkProfile.findUnique({
    where: { id: studentId },
    select: { firstName: true, lastName: true },
  });
  const studentName = [student?.firstName, student?.lastName].filter(Boolean).join(' ') || 'votre enfant';
  const dueDate = assignment.dueDate.toLocaleDateString('fr-FR');
  const copy =
    type === 'published'
      ? {
          subject: `Nouveau devoir — ${studentName}`,
          body: `${studentName} a un nouveau devoir « ${assignment.title} », à rendre pour le ${dueDate}.`,
        }
      : type === 'due_soon'
        ? {
            subject: `Devoir à rendre bientôt — ${studentName}`,
            body: `Rappel : ${studentName} a un devoir « ${assignment.title} » à rendre le ${dueDate}.`,
          }
        : {
            subject: `Devoir en retard — ${studentName}`,
            body: `${studentName} a un devoir « ${assignment.title} » en retard (échéance ${dueDate}).`,
          };

  let sent = 0;
  for (const link of links) {
    const guardian = await prisma.strkProfile.findUnique({
      where: { id: link.guardianId },
      select: { id: true, phoneNumber: true, email: true },
    });
    if (!guardian) continue;
    const preferenceRows = await prisma.strkCommunicationPreference.findMany({ where: { profileId: guardian.id } });
    const preferences = new Map(preferenceRows.map((p) => [p.channel, p.optedIn]));
    const channel = pickPreferredChannel(guardian, preferences);
    const result = await sendCommunication({
      recipientId: guardian.id,
      channel,
      useCase: `assignment_guardian_${type}`,
      locale: 'fr',
      variables: { title: assignment.title, dueDate, studentName },
      subject: copy.subject,
      body: copy.body,
      isCritical: type === 'overdue',
      requestedBy: assignment.teacherId,
    });
    if (result.ok) sent += 1;
  }
  return sent;
};

/** Déclenché à la création d'un devoir (`POST /assignments`) — la
 * publication est immédiate dans ce module, il n'y a pas d'état "brouillon"
 * distinct côté devoir (`status` vaut "active" dès la création). */
export const notifyAssignmentPublished = async (assignmentId: string): Promise<{ sent: number }> => {
  const assignment = await prisma.strkAssignment.findUnique({ where: { id: assignmentId } });
  if (!assignment) return { sent: 0 };
  const roster = await getRoster(assignment.courseId);
  let sent = 0;
  for (const student of roster) {
    const outcome = await notifyStudentOnce(assignment, student.id, 'published');
    if (outcome.sent) sent += 1;
    if (!outcome.skipped) sent += await notifyGuardiansOnce(assignment, student.id, 'published');
  }
  return { sent };
};

export const runAssignmentReminderCheck = async (): Promise<{ checked: number; remindersSent: number }> => {
  const dueSoonThreshold = new Date(Date.now() + getDueSoonHours() * 60 * 60 * 1000);
  const now = new Date();

  const assignments = await prisma.strkAssignment.findMany({
    where: { status: 'active', dueDate: { lte: dueSoonThreshold } },
    take: 1000,
  });

  let checked = 0;
  let remindersSent = 0;

  for (const assignment of assignments) {
    const roster = await getRoster(assignment.courseId);
    if (roster.length === 0) continue;
    checked += 1;

    const type: StrkAssignmentReminderType = assignment.dueDate < now ? 'overdue' : 'due_soon';
    const submissions = await prisma.strkSubmission.findMany({
      where: { assignmentId: assignment.id, studentId: { in: roster.map((s) => s.id) } },
      select: { studentId: true, status: true },
    });
    const submittedIds = new Set(
      submissions.filter((s) => s.status === 'submitted' || s.status === 'graded' || s.status === 'late').map((s) => s.studentId)
    );

    for (const student of roster) {
      if (submittedIds.has(student.id)) continue;
      const outcome = await notifyStudentOnce(assignment, student.id, type);
      if (outcome.sent) remindersSent += 1;
      if (!outcome.skipped) remindersSent += await notifyGuardiansOnce(assignment, student.id, type);
    }
  }

  return { checked, remindersSent };
};

let started = false;

/** Démarre la tâche planifiée (une fois par jour). */
export const startAssignmentReminderCron = (): void => {
  if (started) return;
  started = true;
  scheduleExclusiveCron('0 7 * * *', 'assignment-reminders', async () => {
    const { checked, remindersSent } = await runAssignmentReminderCheck();
    console.log(
      `⏰ Rappels de devoirs : ${checked} devoir(s) examiné(s), ${remindersSent} rappel(s) envoyé(s)`
    );
  });
  console.log('⏰ Tâche planifiée « rappels de devoirs » enregistrée (tous les jours à 7h)');
};
