import { scheduleExclusiveCron } from './cronLock.js';
import { prisma } from './prisma.js';
import { sendEmail } from './email.js';
import { escapeHtml } from './emailLayout.js';
import { logAudit } from './audit.js';

/**
 * Dunning automatisé MVP : relances pendant la grâce (J+2, J+5) avec lien
 * portail / page abonnement. Soft-lock = déjà géré par subscriptionSuspension.
 */

const APP_URL = () => process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:8080';

const DUNNING_DAYS = [2, 5] as const;

export type DunningQueueItem = {
  subscriptionId: string;
  institutionId: string | null;
  status: string;
  expiresAt: string;
  plan: string;
  userEmail: string | null;
  userName: string | null;
  daysPastDue: number;
};

export const listDunningQueue = async (): Promise<DunningQueueItem[]> => {
  const now = Date.now();
  const rows = await prisma.premiumSubscription.findMany({
    where: { status: { in: ['grace', 'suspended'] } },
    orderBy: { expiresAt: 'asc' },
    take: 200,
  });
  const items: DunningQueueItem[] = [];
  for (const sub of rows) {
    const profile = await prisma.strkProfile.findUnique({
      where: { id: sub.userId },
      select: { email: true, firstName: true, lastName: true },
    });
    items.push({
      subscriptionId: sub.id,
      institutionId: sub.institutionId,
      status: sub.status,
      expiresAt: sub.expiresAt.toISOString(),
      plan: sub.plan,
      userEmail: profile?.email ?? null,
      userName: [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || null,
      daysPastDue: Math.max(0, Math.floor((now - sub.expiresAt.getTime()) / 86400000)),
    });
  }
  return items;
};

export const runDunningReminders = async (): Promise<{ nudged: number }> => {
  const now = new Date();
  let nudged = 0;
  const graceSubs = await prisma.premiumSubscription.findMany({
    where: { status: 'grace' },
  });

  for (const sub of graceSubs) {
    const daysPast = Math.floor((now.getTime() - sub.expiresAt.getTime()) / 86400000);
    const already = Array.isArray(sub.expirationNotificationsSent)
      ? (sub.expirationNotificationsSent as unknown[])
      : [];

    for (const day of DUNNING_DAYS) {
      if (daysPast < day) continue;
      const marker = `dunning_${day}`;
      if (already.includes(marker)) continue;

      const profile = await prisma.strkProfile.findUnique({ where: { id: sub.userId } });
      if (!profile?.email) continue;

      const portalUrl = `${APP_URL()}/subscription`;
      await prisma.subscriptionNotification.create({
        data: {
          subscriptionId: sub.id,
          userId: sub.userId,
          notificationType: 'dunning_reminder',
          daysBeforeExpiration: -day,
        },
      });

      await sendEmail({
        to: profile.email,
        subject: `Action requise : renouveler CaddyNote (J+${day})`,
        html: `<p>Bonjour ${escapeHtml(profile.firstName ?? '')},</p>
<p>Votre abonnement est en période de grâce depuis ${daysPast} jour(s). Sans paiement, l’accès passera en lecture seule.</p>
<p><a href="${portalUrl}">Renouveler / ouvrir le portail de paiement</a></p>`,
      });

      await prisma.premiumSubscription.update({
        where: { id: sub.id },
        data: { expirationNotificationsSent: [...already, marker] as object },
      });

      await logAudit({
        institutionId: sub.institutionId,
        actorId: null,
        action: 'billing.dunning.auto',
        targetType: 'subscription',
        targetId: sub.id,
        metadata: { day, daysPast, email: profile.email },
      });

      nudged += 1;
      break; // une relance max par passage cron
    }
  }

  return { nudged };
};

let started = false;

export const startDunningCron = (): void => {
  if (started) return;
  started = true;
  scheduleExclusiveCron('15 9 * * *', 'dunning', async () => {
    const { nudged } = await runDunningReminders();
    console.log(`⏰ Dunning auto : ${nudged} relance(s)`);
  });
  console.log('⏰ Tâche planifiée « dunning automatique » enregistrée (tous les jours à 9h15)');
};
