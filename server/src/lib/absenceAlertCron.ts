import { prisma } from './prisma.js';
import { sendCommunication, pickPreferredChannel } from './communications.js';
import { scheduleExclusiveCron } from './cronLock.js';

/**
 * PRS-004 : alerte parentale automatique après un délai suivant une absence
 * non justifiée, sans doublon d'envoi. S'appuie entièrement sur les briques
 * livrées séparément : rôle parent + `strk_student_guardians` (ELV-002) pour
 * savoir QUI alerter, et le module Communication (COM-001 à 005) pour QUOI
 * envoyer et tracer.
 *
 * Délai configurable via `ABSENCE_ALERT_DELAY_HOURS` (def. 24h) : une
 * absence de type "absence" (pas un simple retard), non justifiée, dont la
 * date remonte à plus de ce délai, et pour laquelle aucune alerte n'a encore
 * été envoyée (`StrkAbsence.alertSentAt`), déclenche un envoi à chaque
 * responsable actif ayant le droit `canReceiveCommunications`.
 *
 * Anti-doublon : `alertSentAt` est posé après traitement de l'absence, quel
 * que soit le nombre de responsables notifiés — une même absence ne peut
 * donc jamais générer une seconde vague d'alertes, y compris si le cron
 * tourne plusieurs fois par jour ou est relancé après un redémarrage.
 *
 * Multi-worker : verrou advisory `cronLock` (P2-D).
 */

const getDelayHours = (): number => {
  const configured = Number(process.env.ABSENCE_ALERT_DELAY_HOURS);
  return Number.isFinite(configured) && configured > 0 ? configured : 24;
};

export const runAbsenceAlertCheck = async (): Promise<{ checked: number; alertsSent: number }> => {
  const threshold = new Date(Date.now() - getDelayHours() * 60 * 60 * 1000);

  const absences = await prisma.strkAbsence.findMany({
    where: { type: 'absence', justified: false, alertSentAt: null, date: { lte: threshold } },
    take: 500, // limite de sécurité par exécution, le reste sera traité au prochain passage
  });

  let alertsSent = 0;
  for (const absence of absences) {
    if (!absence.createdBy) {
      // Aucun auteur identifiable (donnée historique/import) : on ne peut
      // pas attribuer l'alerte à un `requestedBy` valide (contrainte de
      // schéma) — on marque quand même comme traité pour ne pas boucler
      // indéfiniment dessus.
      await prisma.strkAbsence.update({ where: { id: absence.id }, data: { alertSentAt: new Date() } });
      continue;
    }

    const guardianLinks = await prisma.strkStudentGuardian.findMany({
      where: { studentId: absence.studentId, status: 'active', canReceiveCommunications: true },
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
      const formattedDate = absence.date.toLocaleDateString('fr-FR');

      const result = await sendCommunication({
        recipientId: guardian.id,
        channel,
        useCase: 'absence_alert',
        locale: 'fr',
        variables: { date: formattedDate },
        subject: 'Absence non justifiée',
        body: `Une absence non justifiée de votre enfant a été enregistrée le ${formattedDate}. Merci de la justifier auprès de l'établissement dans les meilleurs délais.`,
        isCritical: true,
        requestedBy: absence.createdBy,
      });
      if (result.ok) alertsSent += 1;
      else console.error(`Alerte absence non envoyée (élève ${absence.studentId}, responsable ${guardian.id}) :`, result.error);
    }

    await prisma.strkAbsence.update({ where: { id: absence.id }, data: { alertSentAt: new Date() } });
  }

  return { checked: absences.length, alertsSent };
};

let started = false;

/** Démarre la tâche planifiée (toutes les heures). Appelé une seule fois au
 * démarrage du serveur (`index.ts`). */
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
