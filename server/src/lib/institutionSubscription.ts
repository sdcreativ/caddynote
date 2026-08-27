import { prisma } from './prisma.js';
import { ACTIVE_PLAN_STATUSES } from './quotas.js';
import { syncPublicSubscriptionPlans } from './publicPlans.js';

export const DEFAULT_PLAN_SLUG =
  (process.env.DEFAULT_INSTITUTION_PLAN_SLUG || 'performance').trim().toLowerCase() ||
  'performance';

export const DEFAULT_TRIAL_DAYS = Math.min(
  365,
  Math.max(1, Number.parseInt(process.env.DEFAULT_INSTITUTION_TRIAL_DAYS || '30', 10) || 30)
);

const planSlug = (features: unknown): string | null => {
  if (!features || typeof features !== 'object' || Array.isArray(features)) return null;
  const slug = (features as Record<string, unknown>).slug;
  return typeof slug === 'string' ? slug.toLowerCase() : null;
};

/** Résout le plan défaut (Performance) ; synchronise le catalogue public si besoin. */
export const resolveDefaultSubscriptionPlan = async (planId?: string) => {
  if (planId) {
    const byId = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!byId || byId.isActive === false) {
      throw new Error('Plan introuvable ou inactif');
    }
    return byId;
  }

  const plans = await prisma.subscriptionPlan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
  let match =
    plans.find((p) => planSlug(p.features) === DEFAULT_PLAN_SLUG) ||
    plans.find((p) => p.name.toLowerCase() === DEFAULT_PLAN_SLUG) ||
    plans.find((p) => p.name.toLowerCase() === 'performance');

  if (!match) {
    await syncPublicSubscriptionPlans();
    const refreshed = await prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    match =
      refreshed.find((p) => planSlug(p.features) === DEFAULT_PLAN_SLUG) ||
      refreshed.find((p) => p.name.toLowerCase() === 'performance') ||
      null;
  }

  if (!match) {
    throw new Error(
      `Plan défaut « ${DEFAULT_PLAN_SLUG} » introuvable — lancez seed-public (catalogue Essentiel/Performance/Réseau).`
    );
  }
  return match;
};

const resolveSubscriptionOwnerUserId = async (
  institutionId: string,
  actorUserId: string
): Promise<string> => {
  const institution = await prisma.strkInstitution.findUnique({
    where: { id: institutionId },
    select: { adminId: true },
  });
  if (institution?.adminId) return institution.adminId;

  const schoolAdmin = await prisma.strkProfile.findFirst({
    where: { institutionId, role: 'school_admin' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (schoolAdmin) return schoolAdmin.id;

  return actorUserId;
};

export type EnsureSubscriptionResult =
  | {
      action: 'created';
      institutionId: string;
      subscriptionId: string;
      planId: string;
      planName: string;
      status: string;
    }
  | {
      action: 'skipped';
      institutionId: string;
      reason: 'already_subscribed' | 'institution_missing';
      subscriptionId?: string;
      planId?: string;
      planName?: string;
    };

/**
 * Rattache un établissement orphelin au plan défaut (Performance).
 * N’écrase jamais un abo active/trial/grace existant.
 */
export const ensureInstitutionSubscription = async (params: {
  institutionId: string;
  actorUserId: string;
  planId?: string;
  dryRun?: boolean;
  /** `trial` (défaut) pour onboarding devis ; `active` si déjà commercialement validé. */
  status?: 'trial' | 'active';
}): Promise<EnsureSubscriptionResult> => {
  const institution = await prisma.strkInstitution.findUnique({
    where: { id: params.institutionId },
    select: { id: true },
  });
  if (!institution) {
    return { action: 'skipped', institutionId: params.institutionId, reason: 'institution_missing' };
  }

  const existing = await prisma.premiumSubscription.findFirst({
    where: {
      institutionId: params.institutionId,
      status: { in: [...ACTIVE_PLAN_STATUSES] },
    },
    include: { plan_: true },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) {
    return {
      action: 'skipped',
      institutionId: params.institutionId,
      reason: 'already_subscribed',
      subscriptionId: existing.id,
      planId: existing.planId ?? undefined,
      planName: existing.plan_?.name ?? existing.plan,
    };
  }

  const plan = await resolveDefaultSubscriptionPlan(params.planId);
  const status = params.status ?? 'trial';
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEFAULT_TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const userId = await resolveSubscriptionOwnerUserId(params.institutionId, params.actorUserId);

  if (params.dryRun) {
    return {
      action: 'created',
      institutionId: params.institutionId,
      subscriptionId: 'dry-run',
      planId: plan.id,
      planName: plan.name,
      status,
    };
  }

  const subscription = await prisma.premiumSubscription.create({
    data: {
      userId,
      institutionId: params.institutionId,
      planId: plan.id,
      plan: plan.name,
      status,
      billingCycle: 'monthly',
      startsAt: now,
      expiresAt,
      trialStartsAt: status === 'trial' ? now : null,
      trialEndsAt: status === 'trial' ? expiresAt : null,
      autoRenew: false,
    },
  });

  return {
    action: 'created',
    institutionId: params.institutionId,
    subscriptionId: subscription.id,
    planId: plan.id,
    planName: plan.name,
    status,
  };
};

export type BackfillResult = {
  dryRun: boolean;
  plan: { id: string; name: string; slug: string };
  orphanCount: number;
  created: EnsureSubscriptionResult[];
  skipped: EnsureSubscriptionResult[];
};

/** Établissements sans abo active/trial/grace → rattachement au plan défaut. */
export const backfillInstitutionSubscriptions = async (params: {
  actorUserId: string;
  dryRun: boolean;
  planId?: string;
  status?: 'trial' | 'active';
}): Promise<BackfillResult> => {
  const plan = await resolveDefaultSubscriptionPlan(params.planId);

  const subscribedIds = (
    await prisma.premiumSubscription.findMany({
      where: {
        institutionId: { not: null },
        status: { in: [...ACTIVE_PLAN_STATUSES] },
      },
      select: { institutionId: true },
      distinct: ['institutionId'],
    })
  )
    .map((s) => s.institutionId)
    .filter((id): id is string => !!id);

  const orphans = await prisma.strkInstitution.findMany({
    where: subscribedIds.length > 0 ? { id: { notIn: subscribedIds } } : undefined,
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  const created: EnsureSubscriptionResult[] = [];
  const skipped: EnsureSubscriptionResult[] = [];
  const status = params.status ?? 'trial';

  if (params.dryRun) {
    return {
      dryRun: true,
      plan: { id: plan.id, name: plan.name, slug: DEFAULT_PLAN_SLUG },
      orphanCount: orphans.length,
      created: orphans.map((orphan) => ({
        action: 'created' as const,
        institutionId: orphan.id,
        subscriptionId: 'dry-run',
        planId: plan.id,
        planName: plan.name,
        status,
      })),
      skipped: [],
    };
  }

  for (const orphan of orphans) {
    const result = await ensureInstitutionSubscription({
      institutionId: orphan.id,
      actorUserId: params.actorUserId,
      planId: plan.id,
      dryRun: false,
      status,
    });
    if (result.action === 'created') created.push(result);
    else skipped.push(result);
  }

  return {
    dryRun: false,
    plan: { id: plan.id, name: plan.name, slug: DEFAULT_PLAN_SLUG },
    orphanCount: orphans.length,
    created,
    skipped,
  };
};
