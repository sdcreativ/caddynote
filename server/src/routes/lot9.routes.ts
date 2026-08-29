import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireFeature } from '../middleware/requireFeature.js';
import { isGlobalAdmin, isSameInstitution, SECRETARIAT_ROLES } from '../lib/authz.js';
import { logAudit } from '../lib/audit.js';
import { optionalUuid } from '../lib/zodHelpers.js';
import { subscribeStudentToCanteenPlan, ensureCanteenInvoice } from '../lib/canteenBilling.js';
import { isFeatureEnabled } from '../lib/featureFlags.js';

/**
 * Lot 9 — modules complémentaires (SHOULD/COULD) : transport, cantine,
 * bibliothèque, internat, santé scolaire (visites), RH (fiches hors paie).
 *
 * Socle opérationnel + facturation cantine (S1) + parent `/services/mine`
 * (lecture + self-service cantine/transport). Pas encore : planning bus, paie.
 */
export const lot9Router = Router();
lot9Router.use(requireAuth);

const resolveInstitutionId = (req: Request): string | null => {
  const fromAuth = req.auth?.institutionId ?? null;
  if (fromAuth) return fromAuth;
  if (req.auth && isGlobalAdmin(req.auth)) {
    const raw = req.query.institutionId ?? (req.body as { institutionId?: unknown } | undefined)?.institutionId;
    const parsed = optionalUuid.safeParse(raw);
    if (parsed.success && parsed.data) return parsed.data;
  }
  return null;
};

const requireInst = (req: Request) => resolveInstitutionId(req);

const studentLabel = (p: { firstName: string | null; lastName: string | null; id: string }) =>
  [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.id;

/** Lien parent actif → établissement de l’élève (anti-IDOR). */
const resolveActiveGuardianLink = async (guardianId: string, studentId: string) => {
  return prisma.strkStudentGuardian.findFirst({
    where: { guardianId, studentId, status: 'active' },
    select: { studentId: true, institutionId: true },
  });
};

/** Parent : enfants liés + cantine/transport en lecture seule (hors requireFeature). */
lot9Router.get('/mine', requireRole('parent'), async (req, res) => {
  const links = await prisma.strkStudentGuardian.findMany({
    where: { guardianId: req.auth!.sub, status: 'active' },
    select: { studentId: true, institutionId: true },
  });
  if (links.length === 0) {
    return res.json({ children: [] });
  }

  const studentIds = links.map((l) => l.studentId);
  const profiles = await prisma.strkProfile.findMany({
    where: { id: { in: studentIds } },
    select: { id: true, firstName: true, lastName: true },
  });
  const nameById = Object.fromEntries(profiles.map((p) => [p.id, studentLabel(p)]));

  const institutionIds = [...new Set(links.map((l) => l.institutionId))];
  const lot9Enabled = new Map<string, boolean>();
  const canteenEnabled = new Map<string, boolean>();
  for (const institutionId of institutionIds) {
    lot9Enabled.set(institutionId, await isFeatureEnabled(institutionId, 'lot9_services'));
    canteenEnabled.set(institutionId, await isFeatureEnabled(institutionId, 'canteen'));
  }

  const activeStudentIds = links
    .filter((l) => lot9Enabled.get(l.institutionId))
    .map((l) => l.studentId);

  const transport =
    activeStudentIds.length > 0
      ? await prisma.strkTransportEnrollment.findMany({
          where: { studentId: { in: activeStudentIds }, endDate: null },
          include: {
            route: { select: { id: true, name: true, institutionId: true, isActive: true } },
          },
        })
      : [];

  const canteenStudentIds = links
    .filter((l) => lot9Enabled.get(l.institutionId) && canteenEnabled.get(l.institutionId))
    .map((l) => l.studentId);

  const canteen =
    canteenStudentIds.length > 0
      ? await prisma.strkCanteenSubscription.findMany({
          where: { studentId: { in: canteenStudentIds }, status: 'active', endDate: null },
          include: {
            plan: {
              select: {
                id: true,
                name: true,
                priceCents: true,
                currency: true,
                institutionId: true,
              },
            },
            invoice: {
              select: { id: true, invoiceNumber: true, totalCents: true, status: true, currency: true },
            },
          },
        })
      : [];

  const lot9InstitutionIds = institutionIds.filter((id) => lot9Enabled.get(id));
  const catalogRoutes =
    lot9InstitutionIds.length > 0
      ? await prisma.strkTransportRoute.findMany({
          where: { institutionId: { in: lot9InstitutionIds }, isActive: true },
          include: { enrollments: { where: { endDate: null }, select: { id: true } } },
          orderBy: { name: 'asc' },
        })
      : [];
  const routesByInst = new Map<string, typeof catalogRoutes>();
  for (const r of catalogRoutes) {
    const list = routesByInst.get(r.institutionId) ?? [];
    list.push(r);
    routesByInst.set(r.institutionId, list);
  }

  const canteenInstitutionIds = institutionIds.filter(
    (id) => lot9Enabled.get(id) && canteenEnabled.get(id)
  );
  const catalogPlans =
    canteenInstitutionIds.length > 0
      ? await prisma.strkCanteenPlan.findMany({
          where: { institutionId: { in: canteenInstitutionIds }, isActive: true },
          orderBy: { name: 'asc' },
          select: { id: true, name: true, priceCents: true, currency: true, institutionId: true },
        })
      : [];
  const plansByInst = new Map<string, typeof catalogPlans>();
  for (const p of catalogPlans) {
    const list = plansByInst.get(p.institutionId) ?? [];
    list.push(p);
    plansByInst.set(p.institutionId, list);
  }

  const children = links.map((link) => {
    const lot9On = lot9Enabled.get(link.institutionId) === true;
    const canteenOn = canteenEnabled.get(link.institutionId) === true;

    const enrolledRouteIds = new Set(
      transport
        .filter((e) => e.studentId === link.studentId && e.route.institutionId === link.institutionId)
        .map((e) => e.route.id)
    );
    const subscribedPlanIds = new Set(
      canteen
        .filter((s) => s.studentId === link.studentId && s.plan.institutionId === link.institutionId)
        .map((s) => s.plan.id)
    );

    const availableTransportRoutes = lot9On
      ? (routesByInst.get(link.institutionId) ?? [])
          .filter((r) => !enrolledRouteIds.has(r.id))
          .map((r) => ({
            id: r.id,
            name: r.name,
            capacity: r.capacity,
            seatsLeft: r.capacity == null ? null : Math.max(0, r.capacity - r.enrollments.length),
          }))
          .filter((r) => r.seatsLeft === null || r.seatsLeft > 0)
      : [];

    const availableCanteenPlans =
      lot9On && canteenOn
        ? (plansByInst.get(link.institutionId) ?? []).filter((p) => !subscribedPlanIds.has(p.id))
        : [];

    return {
      studentId: link.studentId,
      studentName: nameById[link.studentId] ?? link.studentId,
      institutionId: link.institutionId,
      servicesEnabled: lot9On,
      canteenEnabled: lot9On && canteenOn,
      transportEnrollments: lot9On
        ? transport
            .filter((e) => e.studentId === link.studentId && e.route.institutionId === link.institutionId)
            .map((e) => ({
              id: e.id,
              routeId: e.route.id,
              routeName: e.route.name,
              startDate: e.startDate,
            }))
        : [],
      canteenSubscriptions:
        lot9On && canteenOn
          ? canteen
              .filter((s) => s.studentId === link.studentId && s.plan.institutionId === link.institutionId)
              .map((s) => ({
                id: s.id,
                planId: s.plan.id,
                planName: s.plan.name,
                priceCents: s.plan.priceCents,
                currency: s.plan.currency,
                startDate: s.startDate,
                invoiceId: s.invoiceId,
                invoice: s.invoice,
              }))
          : [],
      availableTransportRoutes,
      availableCanteenPlans,
    };
  });

  res.json({ children });
});

/** Parent : inscription transport (self-service). */
lot9Router.post('/mine/transport/enroll', requireRole('parent'), async (req, res) => {
  const parsed = z
    .object({ studentId: z.string().uuid(), routeId: z.string().uuid() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Données invalides' });

  const link = await resolveActiveGuardianLink(req.auth!.sub, parsed.data.studentId);
  if (!link) return res.status(403).json({ error: 'Enfant non rattaché' });

  if (!(await isFeatureEnabled(link.institutionId, 'lot9_services'))) {
    return res.status(403).json({ error: 'Services non activés', code: 'feature_disabled' });
  }

  const route = await prisma.strkTransportRoute.findUnique({
    where: { id: parsed.data.routeId },
    include: { enrollments: { where: { endDate: null } } },
  });
  if (!route || route.institutionId !== link.institutionId) {
    return res.status(404).json({ error: 'Circuit introuvable' });
  }
  if (!route.isActive) return res.status(400).json({ error: 'Circuit inactif' });
  if (route.capacity != null && route.enrollments.length >= route.capacity) {
    return res.status(409).json({ error: 'Capacité du circuit atteinte' });
  }
  if (route.enrollments.some((e) => e.studentId === parsed.data.studentId)) {
    return res.status(409).json({ error: 'Élève déjà inscrit sur ce circuit' });
  }

  try {
    const enrollment = await prisma.strkTransportEnrollment.create({
      data: { routeId: route.id, studentId: parsed.data.studentId },
    });
    await logAudit({
      institutionId: link.institutionId,
      actorId: req.auth!.sub,
      action: 'lot9.transport.parent_enrolled',
      targetType: 'transport_enrollment',
      targetId: enrollment.id,
      metadata: { studentId: parsed.data.studentId, routeId: route.id },
    });
    res.status(201).json({ enrollment });
  } catch {
    return res.status(409).json({ error: 'Inscription déjà existante' });
  }
});

/** Parent : souscription cantine (+ facture si prix > 0). */
lot9Router.post('/mine/canteen/subscribe', requireRole('parent'), async (req, res) => {
  const parsed = z
    .object({ studentId: z.string().uuid(), planId: z.string().uuid() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Données invalides' });

  const link = await resolveActiveGuardianLink(req.auth!.sub, parsed.data.studentId);
  if (!link) return res.status(403).json({ error: 'Enfant non rattaché' });

  if (!(await isFeatureEnabled(link.institutionId, 'lot9_services'))) {
    return res.status(403).json({ error: 'Services non activés', code: 'feature_disabled' });
  }
  if (!(await isFeatureEnabled(link.institutionId, 'canteen'))) {
    return res.status(403).json({ error: 'Cantine non activée', code: 'feature_disabled' });
  }

  const plan = await prisma.strkCanteenPlan.findUnique({ where: { id: parsed.data.planId } });
  if (!plan || plan.institutionId !== link.institutionId) {
    return res.status(404).json({ error: 'Formule introuvable' });
  }
  if (!plan.isActive) return res.status(400).json({ error: 'Formule inactive' });

  const active = await prisma.strkCanteenSubscription.findFirst({
    where: {
      planId: plan.id,
      studentId: parsed.data.studentId,
      status: 'active',
      endDate: null,
    },
  });
  if (active) return res.status(409).json({ error: 'Abonnement déjà actif' });

  try {
    const { subscription, invoice } = await subscribeStudentToCanteenPlan({
      plan,
      studentId: parsed.data.studentId,
      actorId: req.auth!.sub,
    });
    await logAudit({
      institutionId: plan.institutionId,
      actorId: req.auth!.sub,
      action: 'lot9.canteen.parent_subscribed',
      targetType: 'canteen_subscription',
      targetId: subscription.id,
      metadata: {
        studentId: parsed.data.studentId,
        planId: plan.id,
        invoiceId: invoice?.id ?? null,
      },
    });
    res.status(201).json({ subscription, invoice });
  } catch {
    return res.status(409).json({ error: 'Abonnement déjà existant' });
  }
});

lot9Router.use(requireFeature('lot9_services'));

/** Élève du même établissement (anti-IDOR cross-tenant). */
const assertStudentInInstitution = async (studentId: string, institutionId: string) => {
  const student = await prisma.strkStudent.findUnique({
    where: { id: studentId },
    select: { institutionId: true },
  });
  return !!student && student.institutionId === institutionId;
};

const loadStudentLabels = async (studentIds: string[]) => {
  const ids = [...new Set(studentIds.filter(Boolean))];
  if (ids.length === 0) return {} as Record<string, string>;
  const profiles = await prisma.strkProfile.findMany({
    where: { id: { in: ids } },
    select: { id: true, firstName: true, lastName: true },
  });
  return Object.fromEntries(profiles.map((p) => [p.id, studentLabel(p)]));
};

// --- Transport ---
lot9Router.get('/transport/routes', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const institutionId = requireInst(req);
  if (!institutionId) return res.status(400).json({ error: 'Aucun établissement associé' });
  const routes = await prisma.strkTransportRoute.findMany({
    where: { institutionId },
    include: { enrollments: { where: { endDate: null }, orderBy: { startDate: 'desc' } } },
    orderBy: { name: 'asc' },
  });
  const labels = await loadStudentLabels(routes.flatMap((r) => r.enrollments.map((e) => e.studentId)));
  res.json({
    routes: routes.map((r) => ({
      ...r,
      enrollments: r.enrollments.map((e) => ({ ...e, studentName: labels[e.studentId] ?? e.studentId })),
    })),
  });
});

const routeSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  capacity: z.number().int().positive().optional(),
});

lot9Router.post('/transport/routes', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const institutionId = requireInst(req);
  if (!institutionId) return res.status(400).json({ error: 'Aucun établissement associé' });
  const parsed = routeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Données invalides' });
  const route = await prisma.strkTransportRoute.create({
    data: { institutionId, ...parsed.data },
  });
  await logAudit({
    institutionId,
    actorId: req.auth!.sub,
    action: 'lot9.transport.route_created',
    targetType: 'transport_route',
    targetId: route.id,
  });
  res.status(201).json({ route });
});

lot9Router.patch('/transport/routes/:id', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const route = await prisma.strkTransportRoute.findUnique({ where: { id: req.params.id } });
  if (!route || !isSameInstitution(req.auth!, route.institutionId)) {
    return res.status(404).json({ error: 'Circuit introuvable' });
  }
  const parsed = z
    .object({
      name: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
      capacity: z.number().int().positive().nullable().optional(),
      isActive: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Données invalides' });
  const updated = await prisma.strkTransportRoute.update({ where: { id: route.id }, data: parsed.data });
  res.json({ route: updated });
});

lot9Router.post('/transport/routes/:id/enroll', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const route = await prisma.strkTransportRoute.findUnique({
    where: { id: req.params.id },
    include: { enrollments: { where: { endDate: null } } },
  });
  if (!route || !isSameInstitution(req.auth!, route.institutionId)) {
    return res.status(404).json({ error: 'Circuit introuvable' });
  }
  if (!route.isActive) return res.status(400).json({ error: 'Circuit inactif' });
  const studentId = z.string().uuid().safeParse(req.body.studentId);
  if (!studentId.success) return res.status(400).json({ error: 'Élève invalide' });
  if (!(await assertStudentInInstitution(studentId.data, route.institutionId))) {
    return res.status(400).json({ error: 'Élève hors établissement' });
  }
  if (route.capacity != null && route.enrollments.length >= route.capacity) {
    return res.status(409).json({ error: 'Capacité du circuit atteinte' });
  }
  const existing = route.enrollments.find((e) => e.studentId === studentId.data);
  if (existing) return res.status(409).json({ error: 'Élève déjà inscrit sur ce circuit' });
  try {
    const enrollment = await prisma.strkTransportEnrollment.create({
      data: { routeId: route.id, studentId: studentId.data },
    });
    res.status(201).json({ enrollment });
  } catch {
    return res.status(409).json({ error: 'Inscription déjà existante' });
  }
});

lot9Router.post('/transport/enrollments/:id/end', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const enrollment = await prisma.strkTransportEnrollment.findUnique({
    where: { id: req.params.id },
    include: { route: true },
  });
  if (!enrollment || !isSameInstitution(req.auth!, enrollment.route.institutionId)) {
    return res.status(404).json({ error: 'Inscription introuvable' });
  }
  if (enrollment.endDate) return res.status(400).json({ error: 'Inscription déjà clôturée' });
  const updated = await prisma.strkTransportEnrollment.update({
    where: { id: enrollment.id },
    data: { endDate: new Date() },
  });
  res.json({ enrollment: updated });
});

// --- Cantine (flag dédié `canteen` en plus de `lot9_services`) ---
lot9Router.get('/canteen/plans', requireRole(...SECRETARIAT_ROLES), requireFeature('canteen'), async (req, res) => {
  const institutionId = requireInst(req);
  if (!institutionId) return res.status(400).json({ error: 'Aucun établissement associé' });
  const plans = await prisma.strkCanteenPlan.findMany({
    where: { institutionId },
    include: {
      subscriptions: {
        where: { status: 'active', endDate: null },
        orderBy: { startDate: 'desc' },
        include: {
          invoice: {
            select: { id: true, invoiceNumber: true, totalCents: true, status: true, currency: true },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  });
  const labels = await loadStudentLabels(plans.flatMap((p) => p.subscriptions.map((s) => s.studentId)));
  res.json({
    plans: plans.map((p) => ({
      ...p,
      subscriptions: p.subscriptions.map((s) => ({
        ...s,
        studentName: labels[s.studentId] ?? s.studentId,
      })),
    })),
  });
});

lot9Router.post('/canteen/plans', requireRole(...SECRETARIAT_ROLES), requireFeature('canteen'), async (req, res) => {
  const institutionId = requireInst(req);
  if (!institutionId) return res.status(400).json({ error: 'Aucun établissement associé' });
  const parsed = z
    .object({
      name: z.string().min(1),
      priceCents: z.number().int().nonnegative().default(0),
      currency: z.string().default('XOF'),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Données invalides' });
  const plan = await prisma.strkCanteenPlan.create({ data: { institutionId, ...parsed.data } });
  await logAudit({
    institutionId,
    actorId: req.auth!.sub,
    action: 'lot9.canteen.plan_created',
    targetType: 'canteen_plan',
    targetId: plan.id,
  });
  res.status(201).json({ plan });
});

lot9Router.patch('/canteen/plans/:id', requireRole(...SECRETARIAT_ROLES), requireFeature('canteen'), async (req, res) => {
  const plan = await prisma.strkCanteenPlan.findUnique({ where: { id: req.params.id } });
  if (!plan || !isSameInstitution(req.auth!, plan.institutionId)) {
    return res.status(404).json({ error: 'Formule introuvable' });
  }
  const parsed = z
    .object({
      name: z.string().min(1).optional(),
      priceCents: z.number().int().nonnegative().optional(),
      isActive: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Données invalides' });
  const updated = await prisma.strkCanteenPlan.update({ where: { id: plan.id }, data: parsed.data });
  res.json({ plan: updated });
});

lot9Router.post('/canteen/plans/:id/subscribe', requireRole(...SECRETARIAT_ROLES), requireFeature('canteen'), async (req, res) => {
  const plan = await prisma.strkCanteenPlan.findUnique({ where: { id: req.params.id } });
  if (!plan || !isSameInstitution(req.auth!, plan.institutionId)) {
    return res.status(404).json({ error: 'Formule introuvable' });
  }
  if (!plan.isActive) return res.status(400).json({ error: 'Formule inactive' });
  const studentId = z.string().uuid().safeParse(req.body.studentId);
  if (!studentId.success) return res.status(400).json({ error: 'Élève invalide' });
  if (!(await assertStudentInInstitution(studentId.data, plan.institutionId))) {
    return res.status(400).json({ error: 'Élève hors établissement' });
  }
  const active = await prisma.strkCanteenSubscription.findFirst({
    where: { planId: plan.id, studentId: studentId.data, status: 'active', endDate: null },
  });
  if (active) return res.status(409).json({ error: 'Abonnement déjà actif' });

  try {
    const { subscription, invoice } = await subscribeStudentToCanteenPlan({
      plan,
      studentId: studentId.data,
      actorId: req.auth!.sub,
    });
    if (invoice) {
      await logAudit({
        institutionId: plan.institutionId,
        actorId: req.auth!.sub,
        action: 'lot9.canteen.invoice_created',
        targetType: 'canteen_subscription',
        targetId: subscription.id,
        metadata: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, amountCents: invoice.totalCents },
      });
    }
    res.status(201).json({ subscription, invoice });
  } catch {
    return res.status(409).json({ error: 'Abonnement déjà existant' });
  }
});

lot9Router.post(
  '/canteen/subscriptions/:id/invoice',
  requireRole(...SECRETARIAT_ROLES),
  requireFeature('canteen'),
  async (req, res) => {
    const subscription = await prisma.strkCanteenSubscription.findUnique({
      where: { id: req.params.id },
      include: { plan: true },
    });
    if (!subscription || !isSameInstitution(req.auth!, subscription.plan.institutionId)) {
      return res.status(404).json({ error: 'Abonnement introuvable' });
    }
    if (subscription.invoiceId) {
      return res.status(409).json({ error: 'Facture déjà liée à cet abonnement' });
    }
    if (subscription.plan.priceCents <= 0) {
      return res.status(400).json({ error: 'Formule gratuite — aucune facture à créer' });
    }
    if (subscription.endDate || subscription.status !== 'active') {
      return res.status(400).json({ error: 'Abonnement inactif' });
    }

    const invoice = await ensureCanteenInvoice({
      subscription,
      plan: subscription.plan,
      actorId: req.auth!.sub,
    });
    const refreshed = await prisma.strkCanteenSubscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    if (invoice) {
      await logAudit({
        institutionId: subscription.plan.institutionId,
        actorId: req.auth!.sub,
        action: 'lot9.canteen.invoice_created',
        targetType: 'canteen_subscription',
        targetId: subscription.id,
        metadata: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, backfill: true },
      });
    }
    res.status(201).json({ subscription: refreshed, invoice });
  }
);

lot9Router.post('/canteen/subscriptions/:id/end', requireRole(...SECRETARIAT_ROLES), requireFeature('canteen'), async (req, res) => {
  const subscription = await prisma.strkCanteenSubscription.findUnique({
    where: { id: req.params.id },
    include: { plan: true },
  });
  if (!subscription || !isSameInstitution(req.auth!, subscription.plan.institutionId)) {
    return res.status(404).json({ error: 'Abonnement introuvable' });
  }
  if (subscription.endDate || subscription.status !== 'active') {
    return res.status(400).json({ error: 'Abonnement déjà clôturé' });
  }
  const updated = await prisma.strkCanteenSubscription.update({
    where: { id: subscription.id },
    data: { endDate: new Date(), status: 'ended' },
  });
  res.json({ subscription: updated });
});

// --- Bibliothèque ---
lot9Router.get('/library/items', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const institutionId = requireInst(req);
  if (!institutionId) return res.status(400).json({ error: 'Aucun établissement associé' });
  const items = await prisma.strkLibraryItem.findMany({
    where: { institutionId },
    include: { loans: { where: { returnedAt: null }, orderBy: { borrowedAt: 'desc' } } },
    orderBy: { title: 'asc' },
  });
  const labels = await loadStudentLabels(items.flatMap((i) => i.loans.map((l) => l.studentId)));
  res.json({
    items: items.map((i) => ({
      ...i,
      loans: i.loans.map((l) => ({ ...l, studentName: labels[l.studentId] ?? l.studentId })),
    })),
  });
});

lot9Router.post('/library/items', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const institutionId = requireInst(req);
  if (!institutionId) return res.status(400).json({ error: 'Aucun établissement associé' });
  const parsed = z
    .object({
      title: z.string().min(1),
      author: z.string().optional(),
      isbn: z.string().optional(),
      quantity: z.number().int().positive().default(1),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Données invalides' });
  const item = await prisma.strkLibraryItem.create({
    data: {
      institutionId,
      title: parsed.data.title,
      author: parsed.data.author,
      isbn: parsed.data.isbn,
      quantity: parsed.data.quantity,
      available: parsed.data.quantity,
    },
  });
  res.status(201).json({ item });
});

lot9Router.post('/library/items/:id/loan', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const item = await prisma.strkLibraryItem.findUnique({ where: { id: req.params.id } });
  if (!item || !isSameInstitution(req.auth!, item.institutionId)) {
    return res.status(404).json({ error: 'Ouvrage introuvable' });
  }
  if (item.available < 1) return res.status(409).json({ error: 'Aucun exemplaire disponible' });
  const parsed = z
    .object({
      studentId: z.string().uuid(),
      dueAt: z.string().min(1).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Données invalides' });
  if (!(await assertStudentInInstitution(parsed.data.studentId, item.institutionId))) {
    return res.status(400).json({ error: 'Élève hors établissement' });
  }
  const dueAt = parsed.data.dueAt
    ? new Date(parsed.data.dueAt)
    : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(dueAt.getTime())) return res.status(400).json({ error: 'Date d’échéance invalide' });
  const loan = await prisma.$transaction(async (tx) => {
    const locked = await tx.strkLibraryItem.findUnique({ where: { id: item.id } });
    if (!locked || locked.available < 1) throw new Error('UNAVAILABLE');
    await tx.strkLibraryItem.update({ where: { id: item.id }, data: { available: { decrement: 1 } } });
    return tx.strkLibraryLoan.create({
      data: { itemId: item.id, studentId: parsed.data.studentId, dueAt },
    });
  }).catch((err) => {
    if (err instanceof Error && err.message === 'UNAVAILABLE') return null;
    throw err;
  });
  if (!loan) return res.status(409).json({ error: 'Aucun exemplaire disponible' });
  res.status(201).json({ loan });
});

lot9Router.post('/library/loans/:id/return', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const loan = await prisma.strkLibraryLoan.findUnique({ where: { id: req.params.id }, include: { item: true } });
  if (!loan || !isSameInstitution(req.auth!, loan.item.institutionId)) {
    return res.status(404).json({ error: 'Prêt introuvable' });
  }
  if (loan.returnedAt) return res.status(400).json({ error: 'Déjà rendu' });
  const updated = await prisma.$transaction(async (tx) => {
    await tx.strkLibraryItem.update({ where: { id: loan.itemId }, data: { available: { increment: 1 } } });
    return tx.strkLibraryLoan.update({ where: { id: loan.id }, data: { returnedAt: new Date() } });
  });
  res.json({ loan: updated });
});

// --- Internat ---
lot9Router.get('/boarding/rooms', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const institutionId = requireInst(req);
  if (!institutionId) return res.status(400).json({ error: 'Aucun établissement associé' });
  const rooms = await prisma.strkBoardingRoom.findMany({
    where: { institutionId },
    include: { assignments: { where: { endDate: null }, orderBy: { startDate: 'desc' } } },
    orderBy: { label: 'asc' },
  });
  const labels = await loadStudentLabels(rooms.flatMap((r) => r.assignments.map((a) => a.studentId)));
  res.json({
    rooms: rooms.map((r) => ({
      ...r,
      assignments: r.assignments.map((a) => ({ ...a, studentName: labels[a.studentId] ?? a.studentId })),
    })),
  });
});

lot9Router.post('/boarding/rooms', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const institutionId = requireInst(req);
  if (!institutionId) return res.status(400).json({ error: 'Aucun établissement associé' });
  const parsed = z.object({ label: z.string().min(1), capacity: z.number().int().positive().default(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Données invalides' });
  const room = await prisma.strkBoardingRoom.create({ data: { institutionId, ...parsed.data } });
  res.status(201).json({ room });
});

lot9Router.post('/boarding/rooms/:id/assign', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const room = await prisma.strkBoardingRoom.findUnique({
    where: { id: req.params.id },
    include: { assignments: { where: { endDate: null } } },
  });
  if (!room || !isSameInstitution(req.auth!, room.institutionId)) {
    return res.status(404).json({ error: 'Chambre introuvable' });
  }
  if (room.assignments.length >= room.capacity) {
    return res.status(409).json({ error: 'Capacité atteinte' });
  }
  const studentId = z.string().uuid().safeParse(req.body.studentId);
  if (!studentId.success) return res.status(400).json({ error: 'Élève invalide' });
  if (!(await assertStudentInInstitution(studentId.data, room.institutionId))) {
    return res.status(400).json({ error: 'Élève hors établissement' });
  }
  const already = room.assignments.find((a) => a.studentId === studentId.data);
  if (already) return res.status(409).json({ error: 'Élève déjà affecté à cette chambre' });
  const assignment = await prisma.strkBoardingAssignment.create({
    data: { roomId: room.id, studentId: studentId.data },
  });
  res.status(201).json({ assignment });
});

lot9Router.post('/boarding/assignments/:id/end', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const assignment = await prisma.strkBoardingAssignment.findUnique({
    where: { id: req.params.id },
    include: { room: true },
  });
  if (!assignment || !isSameInstitution(req.auth!, assignment.room.institutionId)) {
    return res.status(404).json({ error: 'Affectation introuvable' });
  }
  if (assignment.endDate) return res.status(400).json({ error: 'Affectation déjà clôturée' });
  const updated = await prisma.strkBoardingAssignment.update({
    where: { id: assignment.id },
    data: { endDate: new Date() },
  });
  res.json({ assignment: updated });
});

// --- Santé scolaire (visites) ---
lot9Router.get('/clinic/visits', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const institutionId = requireInst(req);
  if (!institutionId) return res.status(400).json({ error: 'Aucun établissement associé' });
  const visits = await prisma.strkClinicVisit.findMany({
    where: { institutionId },
    orderBy: { visitAt: 'desc' },
    take: 100,
  });
  const labels = await loadStudentLabels(visits.map((v) => v.studentId));
  res.json({
    visits: visits.map((v) => ({ ...v, studentName: labels[v.studentId] ?? v.studentId })),
  });
});

lot9Router.post('/clinic/visits', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const institutionId = requireInst(req);
  if (!institutionId) return res.status(400).json({ error: 'Aucun établissement associé' });
  const parsed = z
    .object({
      studentId: z.string().uuid(),
      reason: z.string().min(1),
      notes: z.string().optional(),
      visitAt: z.string().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Données invalides' });
  if (!(await assertStudentInInstitution(parsed.data.studentId, institutionId))) {
    return res.status(400).json({ error: 'Élève hors établissement' });
  }
  const visit = await prisma.strkClinicVisit.create({
    data: {
      institutionId,
      studentId: parsed.data.studentId,
      reason: parsed.data.reason,
      notes: parsed.data.notes,
      visitAt: parsed.data.visitAt ? new Date(parsed.data.visitAt) : new Date(),
      createdBy: req.auth!.sub,
    },
  });
  await logAudit({
    institutionId,
    actorId: req.auth!.sub,
    action: 'lot9.clinic.visit_recorded',
    targetType: 'clinic_visit',
    targetId: visit.id,
    metadata: { studentId: visit.studentId },
  });
  res.status(201).json({ visit });
});

// --- RH (hors paie) ---
lot9Router.get('/hr/staff', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const institutionId = requireInst(req);
  if (!institutionId) return res.status(400).json({ error: 'Aucun établissement associé' });
  const records = await prisma.strkHrStaffRecord.findMany({
    where: { institutionId },
    include: { profile: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } },
    orderBy: { jobTitle: 'asc' },
  });
  res.json({ records });
});

lot9Router.post('/hr/staff', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const institutionId = requireInst(req);
  if (!institutionId) return res.status(400).json({ error: 'Aucun établissement associé' });
  const parsed = z
    .object({
      profileId: z.string().uuid(),
      jobTitle: z.string().min(1),
      contractType: z.string().optional(),
      startDate: z.string().optional(),
      notes: z.string().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Données invalides' });
  const profile = await prisma.strkProfile.findUnique({ where: { id: parsed.data.profileId } });
  if (!profile || profile.institutionId !== institutionId) {
    return res.status(400).json({ error: 'Profil invalide pour cet établissement' });
  }
  const record = await prisma.strkHrStaffRecord.create({
    data: {
      institutionId,
      profileId: parsed.data.profileId,
      jobTitle: parsed.data.jobTitle,
      contractType: parsed.data.contractType,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
      notes: parsed.data.notes,
    },
  });
  await logAudit({
    institutionId,
    actorId: req.auth!.sub,
    action: 'lot9.hr.staff_recorded',
    targetType: 'hr_staff_record',
    targetId: record.id,
  });
  res.status(201).json({ record });
});
