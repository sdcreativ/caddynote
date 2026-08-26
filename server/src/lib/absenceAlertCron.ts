import { prisma } from './prisma.js';
import { sendCommunication, pickPreferredChannel } from './communications.js';
import { scheduleExclusiveCron } from './cronLock.js';
import { addMinutesToHhMm, normalizeTimeHhMm } from './courseSchedule.js';
import type { StrkAbsence } from '@prisma/client';

/**
 * PRS-004 : alerte parentale sur absence / retard saisis à l’appel.
 *
 * - **Immédiat** : à la saisie (`notifyGuardiansOfAbsence`) — le parent est
 *   informé dès qu’un élève est marqué absent ou en retard.
 * - **Filet cron** : absences non justifiées anciennes sans `alertSentAt`
 *   (imports, bugs) après `ABSENCE_ALERT_DELAY_HOURS` (défaut 24h). Les
 *   retards ne passent pas par ce filet (notification uniquement à la saisie).
 *
 * Anti-doublon : `alertSentAt` est posé après traitement.
 */

const getDelayHours = (): number => {
  const configured = Number(process.env.ABSENCE_ALERT_DELAY_HOURS);
  return Number.isFinite(configured) && configured > 0 ? configured : 24;
};

export type NotifyAbsenceResult = { alertsSent: number; skipped: boolean };

export type AttendanceEventKind = 'absence' | 'lateness';

export type AbsenceAlertContext = {
  studentName: string;
  courseName: string | null;
  courseTime: string | null;
  formattedDate: string;
};

/** Libellé prénom + nom ; repli sur « votre enfant » si profil incomplet. */
export const formatStudentDisplayName = (
  profile: { firstName: string | null; lastName: string | null } | null
): string => {
  const parts = [profile?.firstName?.trim(), profile?.lastName?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'votre enfant';
};

const buildWhenClause = (ctx: AbsenceAlertContext): string => {
  const { courseName, courseTime, formattedDate } = ctx;
  const whenParts: string[] = [`le ${formattedDate}`];
  if (courseName) {
    whenParts.push(courseTime ? `au cours de ${courseName} (${courseTime})` : `au cours de ${courseName}`);
  } else if (courseTime) {
    whenParts.push(`à ${courseTime}`);
  }
  return whenParts.join(' ');
};

/**
 * Construit objet / corps explicites (enfant, cours, horaire, date).
 * Les parties manquantes (pas de cours, pas d’horaire) sont omises sans
 * rendre le message ambigu.
 */
export const formatAbsenceAlertCopy = (
  ctx: AbsenceAlertContext,
  opts?: { immediate?: boolean; kind?: AttendanceEventKind }
): { subject: string; body: string; variables: Record<string, string> } => {
  const immediate = opts?.immediate !== false;
  const kind: AttendanceEventKind = opts?.kind ?? 'absence';
  const { studentName, courseName, courseTime, formattedDate } = ctx;
  const when = buildWhenClause(ctx);

  if (kind === 'lateness') {
    return {
      subject: `Retard de ${studentName}`,
      body: `${studentName} a été marqué(e) en retard ${when}.`,
      variables: {
        studentName,
        date: formattedDate,
        courseName: courseName ?? '',
        courseTime: courseTime ?? '',
        kind,
      },
    };
  }

  const subject = immediate
    ? `Absence de ${studentName}`
    : `Absence non justifiée — ${studentName}`;

  const body = immediate
    ? `${studentName} a été marqué(e) absent(e) ${when}. Vous pouvez justifier l’absence depuis votre espace parent.`
    : `Une absence non justifiée de ${studentName} a été enregistrée ${when}. Merci de la justifier auprès de l'établissement dans les meilleurs délais.`;

  return {
    subject,
    body,
    variables: {
      studentName,
      date: formattedDate,
      courseName: courseName ?? '',
      courseTime: courseTime ?? '',
      kind,
    },
  };
};

/** Horaire du créneau : emploi du temps du jour, sinon `scheduleTime` du cours. */
const resolveCourseTimeLabel = async (
  courseId: string,
  absenceDate: Date,
  course: { scheduleTime: string | null; duration: number | null }
): Promise<string | null> => {
  const dayOfWeek = absenceDate.getUTCDay();
  const schedule = await prisma.strkSchedule.findFirst({
    where: { courseId, dayOfWeek, OR: [{ isActive: true }, { isActive: null }] },
    select: { startTime: true, endTime: true },
    orderBy: { startTime: 'asc' },
  });

  if (schedule) {
    const start = normalizeTimeHhMm(schedule.startTime) ?? schedule.startTime.trim();
    const end = normalizeTimeHhMm(schedule.endTime) ?? schedule.endTime.trim();
    return start && end ? `${start}–${end}` : start || end || null;
  }

  if (!course.scheduleTime?.trim()) return null;
  const start = normalizeTimeHhMm(course.scheduleTime) ?? course.scheduleTime.trim();
  if (!start) return null;
  const end =
    course.duration && course.duration > 0 ? addMinutesToHhMm(start, course.duration) : null;
  return end ? `${start}–${end}` : start;
};

const loadAbsenceAlertContext = async (
  absence: Pick<StrkAbsence, 'studentId' | 'courseId' | 'date'>
): Promise<AbsenceAlertContext> => {
  const [profile, course] = await Promise.all([
    prisma.strkProfile.findUnique({
      where: { id: absence.studentId },
      select: { firstName: true, lastName: true },
    }),
    absence.courseId
      ? prisma.strkCourse.findUnique({
          where: { id: absence.courseId },
          select: { name: true, scheduleTime: true, duration: true },
        })
      : Promise.resolve(null),
  ]);

  const courseTime = course
    ? await resolveCourseTimeLabel(absence.courseId!, absence.date, course)
    : null;

  return {
    studentName: formatStudentDisplayName(profile),
    courseName: course?.name?.trim() || null,
    courseTime,
    formattedDate: absence.date.toLocaleDateString('fr-FR', { timeZone: 'UTC' }),
  };
};

/**
 * Notifie les responsables actifs (`canReceiveCommunications`) pour une
 * absence ou un retard. No-op si déjà alerté, justifié, type inconnu, ou
 * sans `createdBy` (dans ce dernier cas on pose quand même `alertSentAt`).
 */
export const notifyGuardiansOfAbsence = async (
  absence: Pick<
    StrkAbsence,
    'id' | 'studentId' | 'courseId' | 'date' | 'type' | 'justified' | 'alertSentAt' | 'createdBy'
  >,
  opts?: { immediate?: boolean }
): Promise<NotifyAbsenceResult> => {
  if (absence.type !== 'absence' && absence.type !== 'lateness') {
    return { alertsSent: 0, skipped: true };
  }
  if (absence.justified) return { alertsSent: 0, skipped: true };
  if (absence.alertSentAt) return { alertsSent: 0, skipped: true };

  if (!absence.createdBy) {
    await prisma.strkAbsence.update({ where: { id: absence.id }, data: { alertSentAt: new Date() } });
    return { alertsSent: 0, skipped: true };
  }

  const guardianLinks = await prisma.strkStudentGuardian.findMany({
    where: { studentId: absence.studentId, status: 'active', canReceiveCommunications: true },
    select: { guardianId: true },
  });

  const kind: AttendanceEventKind = absence.type;
  const ctx = await loadAbsenceAlertContext(absence);
  const { subject, body, variables } = formatAbsenceAlertCopy(ctx, { ...opts, kind });

  let alertsSent = 0;
  for (const link of guardianLinks) {
    const guardian = await prisma.strkProfile.findUnique({
      where: { id: link.guardianId },
      select: { id: true, phoneNumber: true, email: true },
    });
    if (!guardian) continue;

    const preferenceRows = await prisma.strkCommunicationPreference.findMany({
      where: { profileId: guardian.id },
    });
    const preferences = new Map(preferenceRows.map((p) => [p.channel, p.optedIn]));
    const channel = pickPreferredChannel(guardian, preferences);

    const result = await sendCommunication({
      recipientId: guardian.id,
      channel,
      useCase: kind === 'lateness' ? 'lateness_alert' : 'absence_alert',
      locale: 'fr',
      variables,
      subject,
      body,
      isCritical: true,
      requestedBy: absence.createdBy,
    });
    if (result.ok) alertsSent += 1;
    else {
      console.error(
        `Alerte ${kind} non envoyée (élève ${absence.studentId}, responsable ${guardian.id}) :`,
        result.error
      );
    }
  }

  await prisma.strkAbsence.update({ where: { id: absence.id }, data: { alertSentAt: new Date() } });
  return { alertsSent, skipped: false };
};

export const runAbsenceAlertCheck = async (): Promise<{ checked: number; alertsSent: number }> => {
  const threshold = new Date(Date.now() - getDelayHours() * 60 * 60 * 1000);

  const absences = await prisma.strkAbsence.findMany({
    where: { type: 'absence', justified: false, alertSentAt: null, date: { lte: threshold } },
    take: 500,
  });

  let alertsSent = 0;
  for (const absence of absences) {
    const result = await notifyGuardiansOfAbsence(absence, { immediate: false });
    alertsSent += result.alertsSent;
  }

  return { checked: absences.length, alertsSent };
};

let started = false;

export const startAbsenceAlertCron = (): void => {
  if (started) return;
  started = true;
  scheduleExclusiveCron('0 * * * *', 'absence-alerts', async () => {
    const { checked, alertsSent } = await runAbsenceAlertCheck();
    console.log(
      `⏰ Alerte parentale absences : ${checked} absence(s) examinée(s), ${alertsSent} alerte(s) envoyée(s)`
    );
  });
  console.log('⏰ Tâche planifiée « alerte parentale absence » enregistrée (toutes les heures)');
};
