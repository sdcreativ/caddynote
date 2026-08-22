import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { runSubscriptionExpirationCheck } from '../lib/subscriptionCron.js';
import { isStripeConfigured, getStripeClient } from '../lib/stripeClient.js';
import { isGlobalAdmin, isSameInstitution } from '../lib/authz.js';
import { logAudit } from '../lib/audit.js';

export const subscriptionsRouter = Router();

/** Sérialise un objet marketing vers le type JSON Prisma (évite le conflit Zod passthrough). */
const asJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;

/** Catalogue public (accueil) — pas d'auth : seuls les plans actifs. */
subscriptionsRouter.get('/plans', async (_req, res) => {
  const plans = await prisma.subscriptionPlan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
  res.json({ plans });
});

subscriptionsRouter.use(requireAuth);

const planMarketingSchema = z
  .object({
    description: z.string().max(500).optional(),
    featureList: z.array(z.string().min(1).max(200)).max(20).optional(),
    ctaPath: z.string().max(300).optional(),
    featured: z.boolean().optional(),
    slug: z.string().max(64).optional(),
  })
  .passthrough();

const planWriteSchema = z.object({
  name: z.string().min(1).max(120),
  priceMonthly: z.number().min(0),
  priceYearly: z.number().min(0).nullable().optional(),
  stripePriceId: z.string().min(1).max(200).nullable().optional(),
  stripeYearlyPriceId: z.string().min(1).max(200).nullable().optional(),
  maxStudents: z.number().int().positive().nullable().optional(),
  maxInstitutions: z.number().int().positive().nullable().optional(),
  maxMonthlyReports: z.number().int().positive().nullable().optional(),
  storageLimitGb: z.number().int().positive().nullable().optional(),
  maxUsers: z.number().int().positive().nullable().optional(),
  maxSmsPerMonth: z.number().int().positive().nullable().optional(),
  features: planMarketingSchema.optional(),
  isTrial: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

/** Catalogue complet (actifs + inactifs) — admin plateforme. */
subscriptionsRouter.get('/plans/manage', requireRole('admin'), async (_req, res) => {
  const plans = await prisma.subscriptionPlan.findMany({ orderBy: { sortOrder: 'asc' } });
  res.json({ plans });
});

subscriptionsRouter.post('/plans', requireRole('admin'), async (req, res) => {
  const parsed = planWriteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const plan = await prisma.subscriptionPlan.create({
    data: {
      name: parsed.data.name,
      priceMonthly: parsed.data.priceMonthly,
      priceYearly: parsed.data.priceYearly ?? null,
      stripePriceId: parsed.data.stripePriceId ?? null,
      stripeYearlyPriceId: parsed.data.stripeYearlyPriceId ?? null,
      maxStudents: parsed.data.maxStudents ?? null,
      maxInstitutions: parsed.data.maxInstitutions ?? null,
      maxMonthlyReports: parsed.data.maxMonthlyReports ?? null,
      storageLimitGb: parsed.data.storageLimitGb ?? null,
      maxUsers: parsed.data.maxUsers ?? null,
      maxSmsPerMonth: parsed.data.maxSmsPerMonth ?? null,
      features: asJson(parsed.data.features ?? {}),
      isTrial: parsed.data.isTrial ?? false,
      isActive: parsed.data.isActive ?? true,
      sortOrder: parsed.data.sortOrder ?? 0,
    },
  });
  res.status(201).json({ plan });
});

subscriptionsRouter.patch('/plans/:id', requireRole('admin'), async (req, res) => {
  const parsed = planWriteSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const existing = await prisma.subscriptionPlan.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: 'Plan introuvable' });
  }
  const plan = await prisma.subscriptionPlan.update({
    where: { id: req.params.id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.priceMonthly !== undefined ? { priceMonthly: parsed.data.priceMonthly } : {}),
      ...(parsed.data.priceYearly !== undefined ? { priceYearly: parsed.data.priceYearly } : {}),
      ...(parsed.data.stripePriceId !== undefined ? { stripePriceId: parsed.data.stripePriceId } : {}),
      ...(parsed.data.stripeYearlyPriceId !== undefined
        ? { stripeYearlyPriceId: parsed.data.stripeYearlyPriceId }
        : {}),
      ...(parsed.data.maxStudents !== undefined ? { maxStudents: parsed.data.maxStudents } : {}),
      ...(parsed.data.maxInstitutions !== undefined ? { maxInstitutions: parsed.data.maxInstitutions } : {}),
      ...(parsed.data.maxMonthlyReports !== undefined ? { maxMonthlyReports: parsed.data.maxMonthlyReports } : {}),
      ...(parsed.data.storageLimitGb !== undefined ? { storageLimitGb: parsed.data.storageLimitGb } : {}),
      ...(parsed.data.maxUsers !== undefined ? { maxUsers: parsed.data.maxUsers } : {}),
      ...(parsed.data.maxSmsPerMonth !== undefined ? { maxSmsPerMonth: parsed.data.maxSmsPerMonth } : {}),
      ...(parsed.data.features !== undefined ? { features: asJson(parsed.data.features) } : {}),
      ...(parsed.data.isTrial !== undefined ? { isTrial: parsed.data.isTrial } : {}),
      ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
      ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
    },
  });
  res.json({ plan });
});

/** Initialise les 3 offres de l'accueil si le catalogue est vide. */
subscriptionsRouter.post('/plans/seed-public', requireRole('admin'), async (_req, res) => {
  const count = await prisma.subscriptionPlan.count();
  if (count > 0) {
    const plans = await prisma.subscriptionPlan.findMany({ orderBy: { sortOrder: 'asc' } });
    return res.json({ seeded: false, plans });
  }
  const defaults = [
    {
      name: 'Essentiel',
      priceMonthly: 0,
      sortOrder: 1,
      features: {
        slug: 'essentiel',
        description: 'Pour démarrer la transformation numérique.',
        featureList: ['Gestion des élèves', 'Présences & absences', 'Notes et bulletins', 'Espace parents'],
        ctaPath: '/contact?subject=Offre%20Essentiel',
        featured: false,
        priceLabel: 'Sur devis',
      },
    },
    {
      name: 'Performance',
      priceMonthly: 0,
      sortOrder: 2,
      features: {
        slug: 'performance',
        description: 'Pour piloter un établissement complet.',
        featureList: [
          'Tout Essentiel',
          'Paiements Mobile Money',
          'Alertes SMS automatisées',
          'Rapports avancés',
          'Support prioritaire',
        ],
        ctaPath: '/contact?subject=Offre%20Performance',
        featured: true,
        priceLabel: 'Sur devis',
      },
    },
    {
      name: 'Réseau',
      priceMonthly: 0,
      sortOrder: 3,
      features: {
        slug: 'reseau',
        description: 'Pour les groupes scolaires multi-sites.',
        featureList: [
          'Tout Performance',
          'Gestion multi-établissements',
          'Consolidation financière',
          'API & intégrations',
          'Accompagnement dédié',
        ],
        ctaPath: '/contact?subject=Offre%20R%C3%A9seau',
        featured: false,
        priceLabel: 'Personnalisé',
      },
    },
  ];
  await prisma.subscriptionPlan.createMany({
    data: defaults.map((d) => ({
      name: d.name,
      priceMonthly: d.priceMonthly,
      sortOrder: d.sortOrder,
      features: asJson(d.features),
    })),
  });
  const plans = await prisma.subscriptionPlan.findMany({ orderBy: { sortOrder: 'asc' } });
  res.status(201).json({ seeded: true, plans });
});

// Déclenchement manuel de la tâche planifiée quotidienne (remplace l'edge
// function `check-expiring-subscriptions`), utile pour tester sans attendre
// 6h du matin. Réservé à l'admin global (SDCREATIV).
subscriptionsRouter.post('/expiration-check', requireRole('admin'), async (_req, res) => {
  const result = await runSubscriptionExpirationCheck();
  res.json(result);
});

// Vue globale SDCREATIV : tous les abonnements, tous établissements confondus.
subscriptionsRouter.get('/all', requireRole('admin'), async (_req, res) => {
  const subscriptions = await prisma.premiumSubscription.findMany({
    include: {
      plan_: true,
      institution: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const userIds = [...new Set(subscriptions.map((s) => s.userId))];
  const institutionIds = [
    ...new Set(subscriptions.map((s) => s.institutionId).filter((id): id is string => !!id)),
  ];

  const [profiles, userCounts] = await Promise.all([
    prisma.strkProfile.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true, email: true, institutionId: true },
    }),
    institutionIds.length > 0
      ? prisma.strkProfile.groupBy({
          by: ['institutionId'],
          where: { institutionId: { in: institutionIds }, isActive: true },
          _count: { _all: true },
        })
      : Promise.resolve([] as { institutionId: string | null; _count: { _all: number } }[]),
  ]);

  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const countByInstitution = new Map(
    userCounts
      .filter((c) => c.institutionId)
      .map((c) => [c.institutionId as string, c._count._all])
  );

  res.json({
    subscriptions: subscriptions.map((s) => ({
      ...s,
      profile: profileById.get(s.userId) ?? null,
      userCount: s.institutionId ? (countByInstitution.get(s.institutionId) ?? 0) : 1,
    })),
  });
});

// Supervision globale (SDCREATIV) : abonnements qui expirent bientôt / essais
// qui se terminent bientôt, tous établissements confondus.
subscriptionsRouter.get('/alerts', requireRole('admin'), async (_req, res) => {
  const now = new Date();
  const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // premium_subscriptions.user_id n'a aucune contrainte de clé étrangère côté
  // base d'origine (fidèlement reproduit dans schema.prisma) : le profil est
  // donc rattaché manuellement plutôt que via un `include` Prisma.
  const [expiringSubscriptions, endingTrials] = await Promise.all([
    prisma.premiumSubscription.findMany({
      where: { status: 'active', expiresAt: { gte: now, lte: in7Days } },
      select: { id: true, expiresAt: true, userId: true },
    }),
    prisma.premiumSubscription.findMany({
      where: { status: 'active', trialEndsAt: { not: null, gte: now, lte: in7Days } },
      select: { id: true, trialEndsAt: true, userId: true },
    }),
  ]);

  const userIds = [...new Set([...expiringSubscriptions, ...endingTrials].map((s) => s.userId))];
  const profiles = await prisma.strkProfile.findMany({
    where: { id: { in: userIds } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  res.json({
    expiringSubscriptions: expiringSubscriptions.map((s) => ({ ...s, profile: profileById.get(s.userId) ?? null })),
    endingTrials: endingTrials.map((s) => ({ ...s, profile: profileById.get(s.userId) ?? null })),
  });
});

// ORG-001 : un abonnement est rattaché au compte qui l'a payé (souvent la
// direction), mais doit conditionner l'accès de tout le personnel de
// l'établissement (SubscriptionGuard, limites de quota...) — pas seulement
// celui de l'acheteur. On résout donc d'abord par établissement (si
// l'appelant/la cible en a un et qu'un abonnement y est rattaché), et on ne
// retombe sur le compte personnel que faute de mieux (essai perso, ou
// abonnement créé avant que la propagation de l'établissement n'existe).
subscriptionsRouter.get('/current', async (req, res) => {
  const userId = String(req.query.userId ?? req.auth!.sub);
  if (userId !== req.auth!.sub && !['admin', 'school_admin'].includes(req.auth!.role)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }

  const targetProfile =
    userId === req.auth!.sub
      ? { institutionId: req.auth!.institutionId }
      : await prisma.strkProfile.findUnique({ where: { id: userId }, select: { institutionId: true } });

  let subscription = targetProfile?.institutionId
    ? await prisma.premiumSubscription.findFirst({
        where: {
          institutionId: targetProfile.institutionId,
          status: { in: ['active', 'trial', 'grace', 'suspended'] },
        },
        include: { plan_: true },
        orderBy: { createdAt: 'desc' },
      })
    : null;

  if (!subscription) {
    subscription = await prisma.premiumSubscription.findFirst({
      where: { userId, status: { in: ['active', 'trial', 'grace', 'suspended'] } },
      include: { plan_: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  res.json({ subscription });
});

subscriptionsRouter.get('/notifications/unread', async (req, res) => {
  const userId = String(req.query.userId ?? req.auth!.sub);
  if (userId !== req.auth!.sub) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const notifications = await prisma.subscriptionNotification.findMany({
    where: { userId, inAppRead: false },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ notifications });
});

const createNotificationSchema = z.object({
  subscriptionId: z.string().uuid(),
  userId: z.string().uuid(),
  notificationType: z.enum(['trial_warning', 'expiration_warning', 'expired']),
  daysBeforeExpiration: z.number().int().optional(),
});

subscriptionsRouter.post('/notifications', async (req, res) => {
  const parsed = createNotificationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  if (parsed.data.userId !== req.auth!.sub && !['admin', 'school_admin'].includes(req.auth!.role)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const notification = await prisma.subscriptionNotification.create({ data: parsed.data });
  res.status(201).json({ notification });
});

subscriptionsRouter.patch('/notifications/:id/read', async (req, res) => {
  const notification = await prisma.subscriptionNotification.findUnique({ where: { id: req.params.id } });
  if (!notification || notification.userId !== req.auth!.sub) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  await prisma.subscriptionNotification.update({ where: { id: req.params.id }, data: { inAppRead: true } });
  res.json({ success: true });
});

subscriptionsRouter.get('/billing-history/:subscriptionId', async (req, res) => {
  const subscription = await prisma.premiumSubscription.findUnique({ where: { id: req.params.subscriptionId } });
  if (!subscription || (subscription.userId !== req.auth!.sub && !['admin', 'school_admin'].includes(req.auth!.role))) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const billingHistory = await prisma.billingHistory.findMany({
    where: { subscriptionId: req.params.subscriptionId },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ billingHistory });
});

// ORG-004 : un décompte reste une donnée d'établissement — sans vérification,
// un compte de l'établissement A pouvait sonder la taille (nombre d'élèves)
// de n'importe quel autre établissement en devinant/énumérant son id.
subscriptionsRouter.get('/counts/students', async (req, res) => {
  const institutionId = typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined;
  if (institutionId) {
    if (!isSameInstitution(req.auth!, institutionId)) {
      return res.status(403).json({ error: 'Permissions insuffisantes' });
    }
  } else if (!isGlobalAdmin(req.auth!)) {
    // Sans institutionId explicite, seul l'admin global peut obtenir le
    // total tous établissements confondus ; le personnel d'établissement est
    // ramené à son propre périmètre.
    const count = await prisma.strkStudent.count({ where: { institutionId: req.auth!.institutionId ?? '__none__' } });
    return res.json({ count });
  }
  const count = await prisma.strkStudent.count({ where: institutionId ? { institutionId } : {} });
  res.json({ count });
});

subscriptionsRouter.get('/counts/institutions', async (req, res) => {
  const userId = String(req.query.userId ?? req.auth!.sub);
  if (userId !== req.auth!.sub && !isGlobalAdmin(req.auth!)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const count = await prisma.strkInstitution.count({ where: { adminId: userId } });
  res.json({ count });
});

// Actions ops super-admin : suspendre / réactiver / prolonger / changer de plan.
const adminSubscriptionActionSchema = z.object({
  action: z.enum(['suspend', 'reactivate', 'extend', 'cancel', 'change_plan']),
  extendDays: z.number().int().min(1).max(365).optional(),
  planId: z.string().uuid().optional(),
});

subscriptionsRouter.patch('/:id/admin', requireRole('admin'), async (req, res) => {
  const parsed = adminSubscriptionActionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }

  const subscription = await prisma.premiumSubscription.findUnique({
    where: { id: req.params.id },
    include: { plan_: true },
  });
  if (!subscription) {
    return res.status(404).json({ error: 'Abonnement introuvable' });
  }

  const { action, extendDays = 30, planId } = parsed.data;
  let data: Record<string, unknown> = {};
  let stripeMode: 'db_only' | 'stripe_synced' | 'stripe_skipped' = subscription.stripeSubscriptionId
    ? 'stripe_synced'
    : 'db_only';
  let stripeDetail: Record<string, unknown> | undefined;

  // Propagation Stripe avant write-back local (évite split-brain).
  if (subscription.stripeSubscriptionId) {
    if (!isStripeConfigured()) {
      return res.status(501).json({
        error: 'Abonnement lié Stripe mais STRIPE_SECRET_KEY absent — action refusée pour éviter un écart DB/Stripe',
        mode: 'stripe_required',
      });
    }
    const stripe = getStripeClient();
    const stripeSubId = subscription.stripeSubscriptionId;
    try {
      if (action === 'cancel') {
        const stripeSub = await stripe.subscriptions.cancel(stripeSubId);
        stripeDetail = { status: stripeSub.status };
      } else if (action === 'suspend') {
        const stripeSub = await stripe.subscriptions.update(stripeSubId, {
          pause_collection: { behavior: 'mark_uncollectible' },
          cancel_at_period_end: false,
        });
        stripeDetail = { status: stripeSub.status, pause_collection: stripeSub.pause_collection };
      } else if (action === 'reactivate') {
        // Stripe : `pause_collection: ''` lève la pause (doc API).
        const stripeSub = await stripe.subscriptions.update(stripeSubId, {
          pause_collection: '',
          cancel_at_period_end: false,
        } as Parameters<typeof stripe.subscriptions.update>[1]);
        stripeDetail = { status: stripeSub.status };
      } else if (action === 'extend') {
        const base = subscription.expiresAt.getTime() > Date.now() ? subscription.expiresAt : new Date();
        const expiresAt = new Date(base.getTime() + extendDays * 24 * 60 * 60 * 1000);
        const stripeSub = await stripe.subscriptions.update(stripeSubId, {
          trial_end: Math.floor(expiresAt.getTime() / 1000),
          proration_behavior: 'none',
        });
        stripeDetail = { status: stripeSub.status, trial_end: stripeSub.trial_end };
        data = {
          expiresAt,
          status: 'active',
          suspendedAt: null,
          autoRenew: true,
        };
      } else if (action === 'change_plan') {
        if (!planId) {
          return res.status(400).json({ error: 'planId requis pour change_plan' });
        }
        const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
        if (!plan || plan.isActive === false) {
          return res.status(404).json({ error: 'Plan introuvable ou inactif' });
        }
        const priceId =
          subscription.billingCycle === 'yearly' ? plan.stripeYearlyPriceId : plan.stripePriceId;
        if (!priceId) {
          return res.status(422).json({
            error: 'Le plan cible n’a pas de stripePriceId / stripeYearlyPriceId — impossible de changer sur Stripe',
            mode: 'missing_stripe_price',
          });
        }
        const current = await stripe.subscriptions.retrieve(stripeSubId);
        const itemId = current.items.data[0]?.id;
        if (!itemId) {
          return res.status(502).json({ error: 'Abonnement Stripe sans item de prix' });
        }
        const stripeSub = await stripe.subscriptions.update(stripeSubId, {
          items: [{ id: itemId, price: priceId }],
          proration_behavior: 'create_prorations',
          pause_collection: '',
        } as Parameters<typeof stripe.subscriptions.update>[1]);
        stripeDetail = { status: stripeSub.status, priceId };
        data = {
          planId: plan.id,
          plan: plan.name,
          status: plan.isTrial ? 'trial' : 'active',
          suspendedAt: null,
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur Stripe';
      return res.status(502).json({
        error: `Échec Stripe — base locale non modifiée : ${message}`,
        mode: 'stripe_failed',
      });
    }
  }

  if (action === 'suspend' && !data.status) {
    data = { status: 'suspended', suspendedAt: new Date(), autoRenew: false };
  } else if (action === 'reactivate' && !data.status) {
    data = { status: 'active', suspendedAt: null, autoRenew: true };
  } else if (action === 'cancel' && !data.status) {
    data = { status: 'cancelled', autoRenew: false, suspendedAt: subscription.suspendedAt ?? new Date() };
  } else if (action === 'change_plan' && !data.planId) {
    if (!planId) {
      return res.status(400).json({ error: 'planId requis pour change_plan' });
    }
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan || plan.isActive === false) {
      return res.status(404).json({ error: 'Plan introuvable ou inactif' });
    }
    data = {
      planId: plan.id,
      plan: plan.name,
      status: plan.isTrial
        ? 'trial'
        : subscription.status === 'cancelled'
          ? 'active'
          : subscription.status === 'trial'
            ? 'active'
            : subscription.status,
      suspendedAt: null,
    };
  } else if (action === 'extend' && !data.expiresAt) {
    const base = subscription.expiresAt.getTime() > Date.now() ? subscription.expiresAt : new Date();
    const expiresAt = new Date(base.getTime() + extendDays * 24 * 60 * 60 * 1000);
    data = {
      expiresAt,
      status: subscription.status === 'cancelled' || subscription.status === 'suspended' ? 'active' : subscription.status,
      suspendedAt: null,
      autoRenew: true,
    };
  }

  if (!subscription.stripeSubscriptionId) {
    stripeMode = 'db_only';
  }

  const updated = await prisma.premiumSubscription.update({
    where: { id: subscription.id },
    data,
    include: { plan_: true },
  });
  await logAudit({
    institutionId: subscription.institutionId,
    actorId: req.auth!.sub,
    action: `subscription.${action}`,
    targetType: 'subscription',
    targetId: subscription.id,
    metadata: {
      extendDays: action === 'extend' ? extendDays : undefined,
      planId: action === 'change_plan' ? planId : undefined,
      stripeMode,
      stripeDetail,
    },
  });
  res.json({ subscription: updated, mode: stripeMode, stripe: stripeDetail });
});

/**
 * Synchronise un abonnement local depuis Stripe (statut + période).
 * Sans stripeSubscriptionId → 422 avec mode DB only explicite.
 */
subscriptionsRouter.post('/:id/admin/sync-stripe', requireRole('admin'), async (req, res) => {
  const subscription = await prisma.premiumSubscription.findUnique({
    where: { id: req.params.id },
    include: { plan_: true },
  });
  if (!subscription) {
    return res.status(404).json({ error: 'Abonnement introuvable' });
  }
  if (!subscription.stripeSubscriptionId) {
    return res.status(422).json({
      error: 'Abonnement DB only — pas de stripeSubscriptionId',
      mode: 'db_only',
      hint: 'Les actions suspend/extend/change_plan restent locales. Liez Stripe via checkout client.',
    });
  }
  if (!isStripeConfigured()) {
    return res.status(501).json({ error: 'Stripe non configuré (STRIPE_SECRET_KEY)' });
  }

  const stripeSub = await getStripeClient().subscriptions.retrieve(subscription.stripeSubscriptionId);
  const periodEnd = stripeSub.items.data[0]?.current_period_end;
  const statusMap: Record<string, string> = {
    active: 'active',
    trialing: 'trial',
    past_due: 'active',
    canceled: 'cancelled',
    unpaid: 'suspended',
    incomplete: 'trial',
    incomplete_expired: 'cancelled',
    paused: 'suspended',
  };
  const status = statusMap[stripeSub.status] || subscription.status;
  const updated = await prisma.premiumSubscription.update({
    where: { id: subscription.id },
    data: {
      status,
      expiresAt: periodEnd ? new Date(periodEnd * 1000) : subscription.expiresAt,
      autoRenew: !stripeSub.cancel_at_period_end,
      stripeCustomerId:
        typeof stripeSub.customer === 'string' ? stripeSub.customer : subscription.stripeCustomerId,
    },
    include: { plan_: true },
  });

  await logAudit({
    institutionId: subscription.institutionId,
    actorId: req.auth!.sub,
    action: 'subscription.sync_stripe',
    targetType: 'subscription',
    targetId: subscription.id,
    metadata: { stripeStatus: stripeSub.status, localStatus: status },
  });

  res.json({
    subscription: updated,
    mode: 'stripe_synced',
    stripe: { status: stripeSub.status, cancelAtPeriodEnd: stripeSub.cancel_at_period_end },
  });
});

/** Relance dunning : notification + audit (pas d’e-mail externe en test mode). */
subscriptionsRouter.post('/:id/admin/dunning-nudge', requireRole('admin'), async (req, res) => {
  const subscription = await prisma.premiumSubscription.findUnique({
    where: { id: req.params.id },
    include: { plan_: true },
  });
  if (!subscription) {
    return res.status(404).json({ error: 'Abonnement introuvable' });
  }
  const note =
    typeof req.body?.note === 'string' && req.body.note.trim()
      ? req.body.note.trim().slice(0, 500)
      : `Relance dunning — statut ${subscription.status}, expire ${subscription.expiresAt.toISOString().slice(0, 10)}`;

  await prisma.strkNotification.create({
    data: {
      userId: subscription.userId,
      type: 'subscription_dunning',
      title: 'Action requise sur votre abonnement',
      message: note,
      metadata: { subscriptionId: subscription.id, status: subscription.status },
    },
  }).catch(() => undefined);

  await logAudit({
    institutionId: subscription.institutionId,
    actorId: req.auth!.sub,
    action: 'subscription.dunning_nudge',
    targetType: 'subscription',
    targetId: subscription.id,
    metadata: { note },
  });

  res.json({ ok: true, subscriptionId: subscription.id });
});

/** Portail Stripe customer pour un abo lié (ops). */
subscriptionsRouter.post('/:id/admin/billing-portal', requireRole('admin'), async (req, res) => {
  const subscription = await prisma.premiumSubscription.findUnique({ where: { id: req.params.id } });
  if (!subscription?.stripeCustomerId) {
    return res.status(422).json({ error: 'Pas de stripeCustomerId — mode DB only', mode: 'db_only' });
  }
  if (!isStripeConfigured()) {
    return res.status(501).json({ error: 'Stripe non configuré' });
  }
  const appUrl = process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:8080';
  const session = await getStripeClient().billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${appUrl}/super-admin/subscriptions`,
  });
  res.json({ url: session.url, mode: 'stripe' });
});

// Annulation : ne nécessite pas Stripe (simple changement de statut côté
// données). Remplace l'edge function `cancel-subscription`.
subscriptionsRouter.patch('/:id/cancel', async (req, res) => {
  const subscription = await prisma.premiumSubscription.findUnique({ where: { id: req.params.id } });
  if (!subscription || (subscription.userId !== req.auth!.sub && !['admin', 'school_admin'].includes(req.auth!.role))) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const updated = await prisma.premiumSubscription.update({
    where: { id: req.params.id },
    data: { status: 'cancelled', autoRenew: false },
  });
  res.json({ subscription: updated });
});

// Remplace les edge functions Supabase `create-checkout-session` /
// `create-customer-portal`. Réponse 501 explicite tant que STRIPE_SECRET_KEY
// n'est pas configurée (même principe que l'IA/S3 ailleurs dans l'API).
const requireStripeConfigured: import('express').RequestHandler = (_req, res, next) => {
  if (!isStripeConfigured()) {
    return res.status(501).json({
      error: "Le paiement en ligne (Stripe) n'est pas encore configuré sur cette instance. Contactez SDCREATIV.",
    });
  }
  next();
};

const checkoutSessionSchema = z.object({
  planId: z.string().uuid(),
  billingCycle: z.enum(['monthly', 'yearly']).default('monthly'),
});

subscriptionsRouter.post('/checkout-session', requireStripeConfigured, async (req, res) => {
  const parsed = checkoutSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: parsed.data.planId } });
  if (!plan) {
    return res.status(404).json({ error: 'Plan introuvable' });
  }
  const priceId = parsed.data.billingCycle === 'yearly' ? plan.stripeYearlyPriceId : plan.stripePriceId;
  if (!priceId) {
    return res.status(400).json({ error: "Ce plan n'a pas de prix Stripe configuré pour ce cycle de facturation" });
  }

  const profile = await prisma.strkProfile.findUnique({ where: { id: req.auth!.sub } });
  if (!profile?.email) {
    return res.status(400).json({ error: 'Compte sans e-mail, paiement impossible' });
  }

  const stripe = getStripeClient();
  // Réutilise le customer Stripe existant s'il y en a déjà un (évite les
  // doublons de client côté Stripe à chaque nouvel abonnement/essai).
  const existing = await prisma.premiumSubscription.findFirst({
    where: { userId: profile.id, stripeCustomerId: { not: null } },
    orderBy: { createdAt: 'desc' },
  });
  const customerId =
    existing?.stripeCustomerId ??
    (await stripe.customers.create({ email: profile.email, metadata: { userId: profile.id } })).id;

  const appUrl = process.env.APP_URL || 'http://localhost:8080';
  // ORG-001 : l'établissement de l'acheteur est propagé jusqu'à l'abonnement
  // créé par le webhook — sans ça, un abonnement n'était rattaché qu'à
  // l'utilisateur qui a payé, invisible pour le reste du personnel du même
  // établissement (cf. GET /subscriptions/current).
  const metadata = {
    userId: profile.id,
    planId: plan.id,
    billingCycle: parsed.data.billingCycle,
    ...(profile.institutionId ? { institutionId: profile.institutionId } : {}),
  };
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/subscription?checkout=success`,
    cancel_url: `${appUrl}/subscription?checkout=cancelled`,
    metadata,
    subscription_data: { metadata },
  });
  res.json({ url: session.url });
});

subscriptionsRouter.post('/customer-portal', requireStripeConfigured, async (req, res) => {
  const subscription = await prisma.premiumSubscription.findFirst({
    where: { userId: req.auth!.sub, stripeCustomerId: { not: null } },
    orderBy: { createdAt: 'desc' },
  });
  if (!subscription?.stripeCustomerId) {
    return res.status(400).json({ error: 'Aucun abonnement payant avec facturation Stripe configurée' });
  }
  const appUrl = process.env.APP_URL || 'http://localhost:8080';
  const session = await getStripeClient().billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${appUrl}/subscription`,
  });
  res.json({ url: session.url });
});
