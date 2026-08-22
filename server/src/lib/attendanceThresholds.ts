import { scheduleExclusiveCron } from './cronLock.js';
import { prisma } from './prisma.js';
import { sendCommunication, pickPreferredChannel } from './communications.js';
import type { StrkThresholdAlertType } from '@prisma/client';

/**
 * PRS-006 : seuils d'assiduité (absentéisme, retards répétés) avec
 * détection automatique. Par établissement, `StrkInstitution.absenceThreshold`
 * et `.latenessThreshold` (désactivés si `null`) déclenchent une alerte
 * quand un élève cumule au moins ce nombre d'absences non justifiées / de
 * retards sur une fenêtre glissante (`thresholdWindowDays`, 30 jours par
 * défaut).
 *
 * Anti-doublon : contrairement à PRS-004 (une alerte par absence), un seuil
 * porte sur un agrégat — il n'y a pas de ligne unique à marquer "déjà
 * traitée". La garde ici est temporelle : pas de nouvelle alerte pour le
 * même élève/type tant qu'une alerte a déjà été déclenchée dans la fenêtre
 * en cours (`StrkThresholdAlert.triggeredAt` récent) — un établissement
 * n'est donc jamais notifié plus d'une fois par fenêtre pour le même
 * signal, même si la vérification tourne plusieurs fois par jour.
 *
 * Destinataires : la direction de l'établissement (école) pour le suivi, et
 * les responsables actifs (comme PRS-004) pour l'information de la famille
 * — un seuil franchi est un signal distinct d'une simple absence isolée.
 */

const getWindowStart = (windowDays: number): Date => new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

const TYPE_LABEL: Record<StrkThresholdAlertType, string> = {
  absence: 'absences non justifiées',
  lateness: 'retards',
};

export const runAttendanceThresholdCheck = async (): Promise<{ checked: number; alertsSent: number }> => {
  const institutions = await prisma.strkInstitution.findMany({
    where: { OR: [{ absenceThreshold: { not: null } }, { latenessThreshold: { not: null } }] },
  });

  let checked = 0;
  let alertsSent = 0;

  for (const institution of institutions) {
    const windowStart = getWindowStart(institution.thresholdWindowDays);
    const checks: { type: StrkThresholdAlertType; threshold: number | null; where: Record<string, unknown> }[] = [
      {
        type: 'absence',
        threshold: institution.absenceThreshold,
        where: { type: 'absence', justified: false },
      },
      {
        type: 'lateness',
        threshold: institution.latenessThreshold,
        where: { type: 'lateness' },
      },
    ];

    for (const check of checks) {
      if (!check.threshold) continue;

      const grouped = await prisma.strkAbsence.groupBy({
        by: ['studentId'],
        where: { institutionId: institution.id, date: { gte: windowStart }, ...check.where },
        _count: { studentId: true },
        having: { studentId: { _count: { gte: check.threshold } } },
      });
      checked += grouped.length;

      for (const row of grouped) {
        const count = row._count.studentId;
        const recentAlert = await prisma.strkThresholdAlert.findFirst({
          where: { studentId: row.studentId, type: check.type, triggeredAt: { gte: windowStart } },
        });
        if (recentAlert) continue; // déjà alerté pour ce signal dans la fenêtre en cours

        const sent = await notifyThresholdCrossed({
          institutionId: institution.id,
          studentId: row.studentId,
          type: check.type,
          count,
          threshold: check.threshold,
          windowDays: institution.thresholdWindowDays,
        });
        await prisma.strkThresholdAlert.create({
          data: {
            institutionId: institution.id,
            studentId: row.studentId,
            type: check.type,
            count,
            threshold: check.threshold,
            windowDays: institution.thresholdWindowDays,
          },
        });
        if (sent) alertsSent += 1;
      }
    }
  }

  return { checked, alertsSent };
};

const notifyThresholdCrossed = async (params: {
  institutionId: string;
  studentId: string;
  type: StrkThresholdAlertType;
  count: number;
  threshold: number;
  windowDays: number;
}): Promise<boolean> => {
  const student = await prisma.strkStudent.findUnique({
    where: { id: params.studentId },
    include: { profile: { select: { firstName: true, lastName: true } } },
  });
  if (!student) return false;
  const studentName = [student.profile.firstName, student.profile.lastName].filter(Boolean).join(' ') || 'Un élève';
  const label = TYPE_LABEL[params.type];

  // Sans membre de direction identifiable, impossible d'attribuer
  // `requestedBy` (contrainte de schéma) — même traitement que PRS-004 pour
  // une absence sans auteur : on ne bloque jamais la boucle dessus.
  const schoolAdmin = await prisma.strkProfile.findFirst({
    where: { institutionId: params.institutionId, role: 'school_admin' },
  });
  if (!schoolAdmin) {
    console.error(`Seuil d'assiduité franchi (élève ${params.studentId}) mais aucun school_admin pour notifier.`);
    return false;
  }

  let anySent = false;

  // Direction : notification interne (push), toujours disponible.
  const staffMembers = await prisma.strkProfile.findMany({
    where: { institutionId: params.institutionId, role: 'school_admin' },
    select: { id: true },
  });
  for (const staff of staffMembers) {
    const result = await sendCommunication({
      recipientId: staff.id,
      channel: 'push',
      subject: `Seuil d'assiduité franchi`,
      body: `${studentName} cumule ${params.count} ${label} sur les ${params.windowDays} derniers jours (seuil : ${params.threshold}).`,
      isCritical: true,
      requestedBy: schoolAdmin.id,
    });
    if (result.ok) anySent = true;
  }

  // Famille : mêmes principes que PRS-004 (canal préféré, consentement respecté).
  const guardianLinks = await prisma.strkStudentGuardian.findMany({
    where: { studentId: params.studentId, status: 'active', canReceiveCommunications: true },
    select: { guardianId: true },
  });
  for (const link of guardianLinks) {
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
      useCase: params.type === 'absence' ? 'attendance_threshold_absence' : 'attendance_threshold_lateness',
      locale: 'fr',
      variables: { count: String(params.count), threshold: String(params.threshold), windowDays: String(params.windowDays) },
      subject: `Suivi d'assiduité`,
      body: `Nous avons constaté ${params.count} ${label} de votre enfant au cours des ${params.windowDays} derniers jours, ce qui dépasse le seuil fixé par l'établissement (${params.threshold}). Merci de nous contacter pour en échanger.`,
      isCritical: true,
      requestedBy: schoolAdmin.id,
    });
    if (result.ok) anySent = true;
  }

  return anySent;
};

let started = false;

/** Démarre la tâche planifiée (une fois par jour) — l'agrégat sur une
 * fenêtre glissante n'a pas besoin d'une fréquence horaire comme PRS-004. */
export const startAttendanceThresholdCron = (): void => {
  if (started) return;
  started = true;
  scheduleExclusiveCron('0 5 * * *', 'attendance-thresholds', async () => {
    const { checked, alertsSent } = await runAttendanceThresholdCheck();
    console.log(
      `⏰ Seuils d'assiduité : ${checked} élève(s) au-dessus d'un seuil, ${alertsSent} alerte(s) envoyée(s)`
    );
  });
  console.log('⏰ Tâche planifiée « seuils d\'assiduité » enregistrée (tous les jours à 5h)');
};
