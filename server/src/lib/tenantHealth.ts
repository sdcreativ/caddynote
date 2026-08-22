import { prisma } from './prisma.js';
import { getQuotaOverview } from './quotas.js';
import { OPS_FROZEN_FLAG } from './subscriptionSuspension.js';

export type HealthBand = 'healthy' | 'watch' | 'at_risk' | 'critical';

export type TenantHealthScore = {
  institutionId: string;
  score: number;
  band: HealthBand;
  factors: Array<{ key: string; label: string; impact: number; detail: string }>;
  frozen: boolean;
  subscriptionStatus: string | null;
  quotasWarning: number;
  quotasBlocked: number;
  lastSchoolAdminLoginAt: string | null;
};

const bandFor = (score: number): HealthBand => {
  if (score >= 80) return 'healthy';
  if (score >= 60) return 'watch';
  if (score >= 40) return 'at_risk';
  return 'critical';
};

/** Score 0–100 unifié (freeze, abo, quotas, activité admin école). */
export const computeTenantHealth = async (institutionId: string): Promise<TenantHealthScore> => {
  const institution = await prisma.strkInstitution.findUnique({
    where: { id: institutionId },
    select: { id: true, featureOverrides: true },
  });
  if (!institution) {
    throw Object.assign(new Error('Établissement introuvable'), { status: 404 });
  }

  let score = 100;
  const factors: TenantHealthScore['factors'] = [];

  const overrides = (institution.featureOverrides as Record<string, boolean> | null) ?? {};
  const frozen = overrides[OPS_FROZEN_FLAG] === true;
  if (frozen) {
    score -= 40;
    factors.push({
      key: 'ops_frozen',
      label: 'Freeze ops',
      impact: -40,
      detail: 'Établissement gelé manuellement',
    });
  }

  const subscription = await prisma.premiumSubscription.findFirst({
    where: { institutionId },
    orderBy: { createdAt: 'desc' },
    select: { status: true, expiresAt: true },
  });
  const subscriptionStatus = subscription?.status ?? null;
  if (subscriptionStatus === 'suspended') {
    score -= 35;
    factors.push({
      key: 'sub_suspended',
      label: 'Abonnement suspendu',
      impact: -35,
      detail: 'Écritures bloquées (grâce dépassée)',
    });
  } else if (subscriptionStatus === 'grace') {
    score -= 20;
    factors.push({
      key: 'sub_grace',
      label: 'Abonnement en grâce',
      impact: -20,
      detail: 'Échéance dépassée — relance paiement',
    });
  } else if (subscriptionStatus === 'cancelled') {
    score -= 25;
    factors.push({
      key: 'sub_cancelled',
      label: 'Abonnement annulé',
      impact: -25,
      detail: 'Statut cancelled',
    });
  } else if (!subscription) {
    score -= 10;
    factors.push({
      key: 'sub_none',
      label: 'Pas d’abonnement',
      impact: -10,
      detail: 'Aucun PremiumSubscription lié',
    });
  }

  const quotas = await getQuotaOverview(institutionId);
  let quotasWarning = 0;
  let quotasBlocked = 0;
  for (const q of quotas) {
    if (!q.allowed) {
      quotasBlocked += 1;
      score -= 8;
      factors.push({
        key: `quota_block_${q.type}`,
        label: `Quota ${q.type} atteint`,
        impact: -8,
        detail: `${q.current}/${q.limit ?? '∞'}`,
      });
    } else if (q.warning) {
      quotasWarning += 1;
      score -= 3;
      factors.push({
        key: `quota_warn_${q.type}`,
        label: `Quota ${q.type} ≥ 80%`,
        impact: -3,
        detail: `${q.current}/${q.limit ?? '∞'}`,
      });
    }
  }

  const schoolAdmin = await prisma.strkProfile.findFirst({
    where: { institutionId, role: 'school_admin', isActive: true },
    orderBy: { lastLoginAt: 'desc' },
    select: { lastLoginAt: true },
  });
  const lastSchoolAdminLoginAt = schoolAdmin?.lastLoginAt?.toISOString() ?? null;
  if (!schoolAdmin?.lastLoginAt) {
    score -= 10;
    factors.push({
      key: 'admin_never_login',
      label: 'Admin école jamais connecté',
      impact: -10,
      detail: 'Aucun lastLoginAt school_admin',
    });
  } else {
    const days =
      (Date.now() - schoolAdmin.lastLoginAt.getTime()) / (24 * 60 * 60 * 1000);
    if (days > 30) {
      score -= 15;
      factors.push({
        key: 'admin_stale',
        label: 'Admin école inactif > 30 j',
        impact: -15,
        detail: `Dernière connexion il y a ${Math.floor(days)} j`,
      });
    } else if (days > 14) {
      score -= 5;
      factors.push({
        key: 'admin_quiet',
        label: 'Admin école peu actif',
        impact: -5,
        detail: `Dernière connexion il y a ${Math.floor(days)} j`,
      });
    }
  }

  score = Math.max(0, Math.min(100, score));
  return {
    institutionId,
    score,
    band: bandFor(score),
    factors,
    frozen,
    subscriptionStatus,
    quotasWarning,
    quotasBlocked,
    lastSchoolAdminLoginAt,
  };
};
