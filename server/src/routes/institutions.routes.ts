import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { isGlobalAdmin, isSameInstitution, isGroupOwnerOf } from '../lib/authz.js';
import { getQuotaOverview } from '../lib/quotas.js';
import { setFeatureOverride, getFeatureSnapshot } from '../lib/featureFlags.js';
import { OPS_FROZEN_FLAG } from '../lib/subscriptionSuspension.js';
import { logAudit } from '../lib/audit.js';
import { optionalEmail, optionalString, optionalUuid } from '../lib/zodHelpers.js';
import { invalidateDashboardSummaryCache } from '../lib/dashboardCache.js';

export const institutionsRouter = Router();

institutionsRouter.use(requireAuth);

// ORG-004 : un utilisateur ne voit jamais les établissements d'un autre
// tenant — sauf un `group_owner` (ORG-002), limité aux établissements de
// son propre groupe (jamais tous les établissements de la plateforme).
institutionsRouter.get('/', async (req, res) => {
  const institutions = isGlobalAdmin(req.auth!)
    ? await prisma.strkInstitution.findMany({ orderBy: { name: 'asc' } })
    : req.auth!.role === 'group_owner' && req.auth!.groupId
      ? await prisma.strkInstitution.findMany({ where: { groupId: req.auth!.groupId }, orderBy: { name: 'asc' } })
      : req.auth!.institutionId
        ? await prisma.strkInstitution.findMany({ where: { id: req.auth!.institutionId } })
        : [];

  res.json({ institutions });
});

institutionsRouter.get('/:id', async (req, res) => {
  if (isSameInstitution(req.auth!, req.params.id)) {
    const institution = await prisma.strkInstitution.findUnique({ where: { id: req.params.id } });
    if (!institution) {
      return res.status(404).json({ error: 'Établissement introuvable' });
    }
    return res.json({ institution });
  }
  // ORG-002 : accès en lecture pour le `group_owner` du groupe auquel cet
  // établissement appartient — nécessite de charger l'établissement pour
  // connaître son groupId, donc traité séparément de `isSameInstitution`.
  const institution = await prisma.strkInstitution.findUnique({ where: { id: req.params.id } });
  if (!institution || !isGroupOwnerOf(req.auth!, institution.groupId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  res.json({ institution });
});

const createInstitutionSchema = z.object({
  name: z.string().min(1),
  type: z.enum([
    'school',
    'high_school',
    'middle_school',
    'university',
    'training_center',
    'elementary_school',
    'private_school',
  ]),
  address: optionalString,
  phone: optionalString,
  email: optionalEmail,
});

// ORG-001 : seul SDCREATIV (admin global) crée un nouveau tenant.
institutionsRouter.post('/', requireRole('admin'), async (req, res) => {
  const parsed = createInstitutionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const institution = await prisma.strkInstitution.create({ data: parsed.data });
  await invalidateDashboardSummaryCache(null);
  res.status(201).json({ institution });
});

const updateInstitutionSchema = createInstitutionSchema.partial().extend({
  adminId: optionalUuid,
  // PRS-006 : seuils d'alerte d'assiduité — `null` désactive le suivi pour
  // ce type (absence ou retard), indépendamment l'un de l'autre.
  absenceThreshold: z.number().int().positive().nullable().optional(),
  latenessThreshold: z.number().int().positive().nullable().optional(),
  thresholdWindowDays: z.number().int().positive().optional(),
  // FIN-002 : pénalité de retard de paiement — `null` désactive (défaut).
  lateFeeCents: z.number().int().positive().nullable().optional(),
  lateFeeGraceDays: z.number().int().positive().optional(),
});

institutionsRouter.patch('/:id', async (req, res) => {
  if (!isSameInstitution(req.auth!, req.params.id) || !['admin', 'school_admin'].includes(req.auth!.role)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const parsed = updateInstitutionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const { adminId, ...rest } = parsed.data;
  const institution = await prisma.strkInstitution.update({
    where: { id: req.params.id },
    data: { ...rest, adminId },
  });
  res.json({ institution });
});

// Suppression d'un tenant : action destructive réservée à l'admin global.
institutionsRouter.delete('/:id', requireRole('admin'), async (req, res) => {
  await prisma.strkInstitution.delete({ where: { id: req.params.id } });
  await invalidateDashboardSummaryCache(null);
  res.json({ success: true });
});

// --- Quotas (SAA-003) ---

institutionsRouter.get('/:id/quotas', requireRole('admin', 'school_admin'), async (req, res) => {
  if (!isSameInstitution(req.auth!, req.params.id)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const quotas = await getQuotaOverview(req.params.id);
  res.json({ quotas });
});

// --- Feature flags (SAA-005) ---

institutionsRouter.get('/:id/features', async (req, res) => {
  if (!isSameInstitution(req.auth!, req.params.id)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const institution = await prisma.strkInstitution.findUnique({ where: { id: req.params.id } });
  if (!institution) {
    return res.status(404).json({ error: 'Établissement introuvable' });
  }
  const snapshot = await getFeatureSnapshot(req.params.id);
  res.json(snapshot);
});

const featureOverrideSchema = z.object({ enabled: z.boolean().nullable() });

// `enabled: null` retire la surcharge (retombe sur la valeur du plan) —
// distinct de `false` (désactivée explicitement même si le plan l'inclut).
// Réservé à l'admin global : une surcharge par établissement (pilote,
// dérogation commerciale) est une décision de plateforme, pas un réglage
// que l'établissement s'accorde à lui-même.
institutionsRouter.put('/:id/features/:key', requireRole('admin'), async (req, res) => {
  const parsed = featureOverrideSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const overrides = await setFeatureOverride(req.params.id, req.params.key, parsed.data.enabled);
  res.json({ overrides });
});

/** Gel ops établissement (lecture seule, indépendant du billing). */
institutionsRouter.post('/:id/freeze', requireRole('admin'), async (req, res) => {
  const { adminHasPlatformScope } = await import('../lib/platformOps.js');
  if (!(await adminHasPlatformScope(req.auth!, 'security'))) {
    return res.status(403).json({ error: 'Permission ops insuffisante (requis: security)', code: 'platform_perm_denied' });
  }
  const institution = await prisma.strkInstitution.findUnique({ where: { id: req.params.id } });
  if (!institution) return res.status(404).json({ error: 'Établissement introuvable' });
  const overrides = await setFeatureOverride(req.params.id, OPS_FROZEN_FLAG, true);
  await logAudit({
    institutionId: req.params.id,
    actorId: req.auth!.sub,
    action: 'institution.frozen',
    targetType: 'institution',
    targetId: req.params.id,
  });
  res.json({ frozen: true, overrides });
});

institutionsRouter.post('/:id/unfreeze', requireRole('admin'), async (req, res) => {
  const institution = await prisma.strkInstitution.findUnique({ where: { id: req.params.id } });
  if (!institution) return res.status(404).json({ error: 'Établissement introuvable' });
  const overrides = await setFeatureOverride(req.params.id, OPS_FROZEN_FLAG, null);
  await logAudit({
    institutionId: req.params.id,
    actorId: req.auth!.sub,
    action: 'institution.unfrozen',
    targetType: 'institution',
    targetId: req.params.id,
  });
  res.json({ frozen: false, overrides });
});

institutionsRouter.get('/:id/health', requireRole('admin'), async (req, res) => {
  try {
    const { computeTenantHealth } = await import('../lib/tenantHealth.js');
    const health = await computeTenantHealth(req.params.id);
    const institution = await prisma.strkInstitution.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        name: true,
        type: true,
        email: true,
        featureOverrides: true,
      },
    });
    if (!institution) return res.status(404).json({ error: 'Établissement introuvable' });

    const [quotas, users] = await Promise.all([
      getQuotaOverview(req.params.id),
      prisma.strkProfile.findMany({
        where: { institutionId: req.params.id, isActive: true },
        select: { email: true, lastLoginAt: true, role: true },
        orderBy: { lastLoginAt: 'desc' },
        take: 8,
      }),
    ]);
    const subscription = await prisma.premiumSubscription.findFirst({
      where: { institutionId: req.params.id },
      orderBy: { createdAt: 'desc' },
      include: { plan_: true },
    });

    res.json({
      health,
      institution,
      frozen: health.frozen,
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            planName: subscription.plan_?.name || subscription.plan,
            expiresAt: subscription.expiresAt.toISOString(),
          }
        : null,
      quotas: quotas.map((q) => ({
        key: q.type,
        current: q.current,
        limit: q.limit,
        allowed: q.allowed,
        warning: q.warning,
      })),
      usersActive: users.length,
      lastLogins: users.map((u) => ({
        email: u.email,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        role: u.role,
      })),
    });
  } catch (e) {
    const status = (e as { status?: number }).status || 500;
    return res.status(status).json({ error: e instanceof Error ? e.message : 'Erreur' });
  }
});

institutionsRouter.get('/:id/onboarding', requireRole('admin'), async (req, res) => {
  const { getInstitutionOnboarding } = await import('../lib/institutionOnboarding.js');
  res.json(await getInstitutionOnboarding(req.params.id));
});

institutionsRouter.patch('/:id/onboarding', requireRole('admin'), async (req, res) => {
  const parsed = z
    .object({
      admin_ecole: z.boolean().optional(),
      classes: z.boolean().optional(),
      abonnement: z.boolean().optional(),
      premier_envoi: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const { patchInstitutionOnboarding } = await import('../lib/institutionOnboarding.js');
  res.json(await patchInstitutionOnboarding(req.params.id, parsed.data));
});

institutionsRouter.post('/:id/offboard/export', requireRole('admin'), async (req, res) => {
  try {
    const { exportInstitutionBundle } = await import('../lib/institutionOffboard.js');
    const bundle = await exportInstitutionBundle(req.params.id);
    await logAudit({
      institutionId: req.params.id,
      actorId: req.auth!.sub,
      action: 'institution.offboard.export',
      targetType: 'institution',
      targetId: req.params.id,
    });
    res.json(bundle);
  } catch (e) {
    const status = (e as { status?: number }).status || 500;
    return res.status(status).json({ error: e instanceof Error ? e.message : 'Erreur' });
  }
});

institutionsRouter.post('/:id/offboard/anonymize', requireRole('admin'), async (req, res) => {
  const confirm = z.object({ confirm: z.literal('ANONYMIZE') }).safeParse(req.body);
  if (!confirm.success) {
    return res.status(400).json({ error: 'Confirmation requise: { confirm: "ANONYMIZE" }' });
  }
  try {
    const { anonymizeInstitution } = await import('../lib/institutionOffboard.js');
    const result = await anonymizeInstitution(req.params.id, req.auth!.sub);
    res.json({ ok: true, ...result });
  } catch (e) {
    const status = (e as { status?: number }).status || 500;
    return res.status(status).json({ error: e instanceof Error ? e.message : 'Erreur' });
  }
});

institutionsRouter.post('/:id/archive-year', requireRole('admin'), async (req, res) => {
  const parsed = z.object({ academicYear: z.string().min(4).max(20) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'academicYear requis' });
  }
  const result = await prisma.strkClass.updateMany({
    where: { institutionId: req.params.id, academicYear: parsed.data.academicYear },
    data: { isActive: false },
  });
  await prisma.strkSetting.upsert({
    where: {
      category_key: {
        category: 'institution',
        key: `archive:${req.params.id}:${parsed.data.academicYear}`,
      },
    },
    create: {
      category: 'institution',
      key: `archive:${req.params.id}:${parsed.data.academicYear}`,
      value: { archivedAt: new Date().toISOString(), classesDeactivated: result.count },
      description: 'Archivage année scolaire',
      isPublic: false,
    },
    update: {
      value: { archivedAt: new Date().toISOString(), classesDeactivated: result.count },
    },
  });
  await logAudit({
    institutionId: req.params.id,
    actorId: req.auth!.sub,
    action: 'institution.archive_year',
    targetType: 'institution',
    targetId: req.params.id,
    metadata: { academicYear: parsed.data.academicYear, classesDeactivated: result.count },
  });
  res.json({ ok: true, academicYear: parsed.data.academicYear, classesDeactivated: result.count });
});

institutionsRouter.get('/:id/sso-config', requireRole('admin'), async (req, res) => {
  const { loadSsoConfig, redactSsoConfig } = await import('../lib/ssoConfig.js');
  const cfg = await loadSsoConfig(req.params.id);
  res.json({ config: redactSsoConfig(cfg, req.params.id) });
});

institutionsRouter.put('/:id/sso-config', requireRole('admin'), async (req, res) => {
  const { ssoConfigSchema, loadSsoConfig, saveSsoConfig, redactSsoConfig } = await import('../lib/ssoConfig.js');
  const parsed = ssoConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  try {
    const previous = await loadSsoConfig(req.params.id);
    const saved = await saveSsoConfig(req.params.id, parsed.data, previous);
    await logAudit({
      institutionId: req.params.id,
      actorId: req.auth!.sub,
      action: 'institution.sso_config_updated',
      targetType: 'institution',
      targetId: req.params.id,
      metadata: { enabled: saved.enabled, provider: saved.provider },
    });
    res.json({ config: redactSsoConfig(saved, req.params.id) });
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : 'Config SSO invalide' });
  }
});
