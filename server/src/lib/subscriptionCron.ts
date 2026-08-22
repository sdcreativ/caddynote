import { scheduleExclusiveCron } from './cronLock.js';
import { prisma } from './prisma.js';
import { sendEmail } from './email.js';

/**
 * Remplace l'edge function Supabase `check-expiring-subscriptions`. Tourne en
 * tâche planifiée dans le process `server/` (pas d'infra de scheduling
 * externe requise) : chaque jour, détecte les abonnements qui expirent
 * bientôt et les essais qui se terminent bientôt, crée une notification
 * in-app (déjà existant, `SubscriptionNotification`) et envoie un e-mail si
 * SMTP est configuré (sinon dégradation propre, cf. `lib/email.ts`).
 *
 * Idempotent : `expirationNotificationsSent` (déjà présent sur
 * PremiumSubscription) trace les seuils déjà notifiés pour ne jamais
 * doubler un envoi au sein d'une même fenêtre.
 */

const WARNING_THRESHOLDS_DAYS = [7, 3, 1];

export const runSubscriptionExpirationCheck = async (): Promise<{ notified: number }> => {
  const now = new Date();
  let notified = 0;

  for (const days of WARNING_THRESHOLDS_DAYS) {
    const windowStart = new Date(now.getTime());
    const windowEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const expiringSoon = await prisma.premiumSubscription.findMany({
      where: { status: 'active', expiresAt: { gte: windowStart, lte: windowEnd } },
      include: { plan_: true },
    });

    for (const sub of expiringSoon) {
      const alreadySent = Array.isArray(sub.expirationNotificationsSent)
        ? (sub.expirationNotificationsSent as unknown[]).includes(days)
        : false;
      if (alreadySent) continue;

      const profile = await prisma.strkProfile.findUnique({ where: { id: sub.userId } });
      if (!profile?.email) continue;

      await prisma.subscriptionNotification.create({
        data: {
          subscriptionId: sub.id,
          userId: sub.userId,
          notificationType: 'expiration_warning',
          daysBeforeExpiration: days,
        },
      });

      const emailSent = await sendEmail({
        to: profile.email,
        subject: `Votre abonnement CaddyNote expire dans ${days} jour${days > 1 ? 's' : ''}`,
        html: `<p>Bonjour ${profile.firstName ?? ''},</p><p>Votre abonnement${sub.plan_ ? ` « ${sub.plan_.name} »` : ''} expire le ${sub.expiresAt.toLocaleDateString('fr-FR')}. Pensez à le renouveler pour ne pas perdre l'accès à CaddyNote.</p>`,
      });

      const previousDays = Array.isArray(sub.expirationNotificationsSent) ? sub.expirationNotificationsSent : [];
      await prisma.premiumSubscription.update({
        where: { id: sub.id },
        data: { expirationNotificationsSent: [...previousDays, days] as any },
      });

      notified += 1;
      if (!emailSent) {
        console.log(`ℹ️  Alerte d'expiration créée en base pour ${profile.email} (e-mail non envoyé, SMTP non configuré)`);
      }
    }
  }

  // Essais qui se terminent bientôt (mêmes seuils, notification distincte).
  for (const days of WARNING_THRESHOLDS_DAYS) {
    const windowEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const endingTrials = await prisma.premiumSubscription.findMany({
      where: { status: 'active', trialEndsAt: { not: null, gte: now, lte: windowEnd } },
    });
    for (const sub of endingTrials) {
      const profile = await prisma.strkProfile.findUnique({ where: { id: sub.userId } });
      if (!profile?.email) continue;
      await sendEmail({
        to: profile.email,
        subject: `Votre essai gratuit CaddyNote se termine dans ${days} jour${days > 1 ? 's' : ''}`,
        html: `<p>Bonjour ${profile.firstName ?? ''},</p><p>Votre période d'essai se termine le ${sub.trialEndsAt!.toLocaleDateString('fr-FR')}. Choisissez un plan pour continuer à utiliser CaddyNote sans interruption.</p>`,
      });
    }
  }

  return { notified };
};

let started = false;

/** Démarre la tâche planifiée (une fois par jour à 6h locale). Appelé une
 * seule fois au démarrage du serveur (`index.ts`) — jamais dans le chemin de
 * requête, cf. les pièges habituels de tâches planifiées dupliquées. */
export const startSubscriptionCron = (): void => {
  if (started) return;
  started = true;
  scheduleExclusiveCron('0 6 * * *', 'subscription-expiration', async () => {
    const { notified } = await runSubscriptionExpirationCheck();
    console.log(`⏰ Vérification des abonnements expirants : ${notified} notification(s) créée(s)`);
  });
  console.log('⏰ Tâche planifiée « expiration des abonnements » enregistrée (tous les jours à 6h)');
};
