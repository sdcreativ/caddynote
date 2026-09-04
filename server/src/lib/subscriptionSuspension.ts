import { scheduleExclusiveCron } from './cronLock.js';
import { prisma } from './prisma.js';
import { sendEmail } from './email.js';
import { escapeHtml } from './emailLayout.js';

/**
 * SAA-004 (Lot 10) — suspension graduée, jamais de destruction de données.
 * Échelle : `active` → (échéance dépassée) → `grace` (accès intact, relance
 * de paiement) → (délai de grâce dépassé) → `suspended` (écritures
 * bloquées, cf. `middleware/auth.ts`, mais toutes les données restent
 * consultables et exportables — rien n'est jamais supprimé). Le même
 * nombre de jours de grâce que les pénalités de retard de paiement
 * (`StrkInstitution.lateFeeGraceDays`, défaut 7) par cohérence de produit,
 * mais un champ dédié : la grâce d'abonnement SaaS (établissement ↔
 * SDCREATIV) est un concept distinct des pénalités de retard élève ↔
 * établissement (FIN-002).
 */
const GRACE_DAYS = 7;

/** Freeze ops manuel (`featureOverrides.__ops_frozen`) — indépendant du billing. */
export const OPS_FROZEN_FLAG = '__ops_frozen';

export const isInstitutionOpsFrozen = async (institutionId: string): Promise<boolean> => {
  const institution = await prisma.strkInstitution.findUnique({
    where: { id: institutionId },
    select: { featureOverrides: true },
  });
  const overrides = (institution?.featureOverrides as Record<string, boolean> | null) ?? {};
  return overrides[OPS_FROZEN_FLAG] === true;
};

export const isInstitutionSuspended = async (institutionId: string): Promise<boolean> => {
  if (await isInstitutionOpsFrozen(institutionId)) return true;
  const subscription = await prisma.premiumSubscription.findFirst({
    where: { institutionId, status: { in: ['active', 'grace', 'suspended'] } },
    orderBy: { createdAt: 'desc' },
  });
  return subscription?.status === 'suspended';
};

export interface SuspensionCheckResult {
  movedToGrace: number;
  suspended: number;
}

export const runSubscriptionSuspensionCheck = async (): Promise<SuspensionCheckResult> => {
  const now = new Date();
  let movedToGrace = 0;
  let suspended = 0;

  const expiredActive = await prisma.premiumSubscription.findMany({
    where: { status: 'active', expiresAt: { lt: now } },
  });
  for (const sub of expiredActive) {
    await prisma.premiumSubscription.update({ where: { id: sub.id }, data: { status: 'grace' } });
    movedToGrace += 1;
    const profile = await prisma.strkProfile.findUnique({ where: { id: sub.userId } });
    if (profile?.email) {
      const appUrl = process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:8080';
      await sendEmail({
        to: profile.email,
        subject: 'Votre abonnement CaddyNote a expiré',
        html: `<p>Bonjour ${escapeHtml(profile.firstName ?? '')},</p><p>Votre abonnement a expiré le ${sub.expiresAt.toLocaleDateString('fr-FR')}. Vous conservez un accès complet pendant ${GRACE_DAYS} jours le temps de renouveler — passé ce délai, l'accès en écriture sera suspendu (vos données resteront toutefois intactes et consultables).</p><p><a href="${appUrl}/subscription">Renouveler / ouvrir le portail</a></p>`,
      });
    }
  }

  const graceCutoff = new Date(now.getTime() - GRACE_DAYS * 24 * 60 * 60 * 1000);
  const overdueGrace = await prisma.premiumSubscription.findMany({
    where: { status: 'grace', expiresAt: { lt: graceCutoff } },
  });
  for (const sub of overdueGrace) {
    await prisma.premiumSubscription.update({
      where: { id: sub.id },
      data: { status: 'suspended', suspendedAt: now },
    });
    suspended += 1;
    const profile = await prisma.strkProfile.findUnique({ where: { id: sub.userId } });
    if (profile?.email) {
      const appUrl = process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:8080';
      await sendEmail({
        to: profile.email,
        subject: 'Votre compte CaddyNote est en lecture seule',
        html: `<p>Bonjour ${escapeHtml(profile.firstName ?? '')},</p><p>Faute de renouvellement, votre établissement est passé en lecture seule : vos données restent entièrement accessibles et exportables, mais plus aucune modification n'est possible tant que l'abonnement n'est pas renouvelé.</p><p><a href="${appUrl}/subscription">Renouveler / ouvrir le portail</a></p>`,
      });
    }
  }

  return { movedToGrace, suspended };
};

/** Retour à `active` explicite après paiement/intervention manuelle — jamais
 * automatique en dehors du renouvellement réel d'un abonnement. */
export const reactivateSubscription = async (subscriptionId: string): Promise<void> => {
  await prisma.premiumSubscription.update({
    where: { id: subscriptionId },
    data: { status: 'active', suspendedAt: null },
  });
};

let started = false;

export const startSubscriptionSuspensionCron = (): void => {
  if (started) return;
  started = true;
  scheduleExclusiveCron('0 4 * * *', 'subscription-suspension', async () => {
    const { movedToGrace, suspended } = await runSubscriptionSuspensionCheck();
    console.log(
      `⏰ Suspension graduée : ${movedToGrace} abonnement(s) passé(s) en grâce, ${suspended} suspendu(s)`
    );
  });
  console.log('⏰ Tâche planifiée « suspension graduée des abonnements » enregistrée (tous les jours à 4h)');
};
