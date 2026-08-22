/**
 * Relances automatiques pièces d'inscription (§12) — échéances + manquants.
 */
import { scheduleExclusiveCron } from './cronLock.js';
import { prisma } from './prisma.js';
import { getAdmissionInstitutionPolicy } from './admissionSettings.js';
import { notifyAdmissionContact, pickGuardianPhone } from './admissionFollowUp.js';

let started = false;

export const runAdmissionDocumentReminderCheck = async (): Promise<{
  checked: number;
  reminded: number;
}> => {
  const institutions = await prisma.strkInstitution.findMany({ select: { id: true }, take: 500 });
  let checked = 0;
  let reminded = 0;
  const now = new Date();

  for (const inst of institutions) {
    const policy = await getAdmissionInstitutionPolicy(inst.id);
    const expiryHorizon = new Date(now.getTime() + policy.expiryReminderDays * 86400000);
    const deadlineHorizon = new Date(now.getTime() + policy.deadlineReminderDays * 86400000);

    // Pièces bientôt expirées
    const expiring = await prisma.strkAdmissionDocumentItem.findMany({
      where: {
        waived: false,
        expiryRemindedAt: null,
        expiresAt: { gte: now, lte: expiryHorizon },
        status: { in: ['uploaded', 'in_review', 'compliant', 'original_pending', 'finalized'] },
        application: {
          institutionId: inst.id,
          status: { in: ['draft', 'needs_info', 'submitted', 'conditionally_accepted'] },
        },
      },
      include: {
        application: true,
        documentType: true,
      },
      take: 100,
    });

    for (const item of expiring) {
      checked += 1;
      const channels = policy.channels;
      if (channels.email || channels.sms || channels.whatsapp) {
        await notifyAdmissionContact({
          to: item.application.contactEmail,
          studentFirstName: item.application.studentFirstName,
          studentLastName: item.application.studentLastName,
          publicToken: item.application.publicToken,
          kind: 'piece_expired',
          detail: `${item.documentType.label} — expire bientôt`,
          phone: channels.sms || channels.whatsapp ? pickGuardianPhone(item.application.guardians) : null,
          channelOverride: channels,
        }).catch(() => undefined);
      }
      await prisma.strkAdmissionDocumentItem.update({
        where: { id: item.id },
        data: { expiryRemindedAt: now },
      });
      reminded += 1;
    }

    // Dépôts bientôt clos + pièce encore manquante
    const deadlineItems = await prisma.strkAdmissionDocumentItem.findMany({
      where: {
        waived: false,
        deadlineRemindedAt: null,
        status: 'missing',
        requirement: {
          depositClosesAt: { gte: now, lte: deadlineHorizon },
        },
        application: {
          institutionId: inst.id,
          status: { in: ['draft', 'needs_info'] },
        },
      },
      include: {
        application: true,
        documentType: true,
        requirement: true,
      },
      take: 100,
    });

    for (const item of deadlineItems) {
      checked += 1;
      const channels = policy.channels;
      await notifyAdmissionContact({
        to: item.application.contactEmail,
        studentFirstName: item.application.studentFirstName,
        studentLastName: item.application.studentLastName,
        publicToken: item.application.publicToken,
        kind: 'needs_info',
        detail: `Dépôt bientôt clos : ${item.documentType.label}`,
        phone: channels.sms || channels.whatsapp ? pickGuardianPhone(item.application.guardians) : null,
        channelOverride: channels,
      }).catch(() => undefined);
      await prisma.strkAdmissionDocumentItem.update({
        where: { id: item.id },
        data: { deadlineRemindedAt: now },
      });
      reminded += 1;
    }
  }

  return { checked, reminded };
};

export const startAdmissionDocumentReminderCron = (): void => {
  if (started) return;
  started = true;
  // Toutes les 6 heures
  scheduleExclusiveCron('0 */6 * * *', 'admission-doc-reminders', async () => {
    await runAdmissionDocumentReminderCheck();
  });
};
