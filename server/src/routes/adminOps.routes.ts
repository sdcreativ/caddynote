import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requirePlatformPerm } from '../middleware/requirePlatformPerm.js';
import { registry } from '../lib/metrics.js';
import { isQueueStarted } from '../lib/queue.js';
import { getProcessRole, shouldRunJobs, shouldServeHttp } from '../lib/processRole.js';

/**
 * Recherche globale + métriques ops + RoPA pour la console super-admin.
 *
 * `/impersonate/exit` est enregistré AVANT `requireRole('admin')` : pendant
 * une impersonation le JWT porte le rôle de la cible, pas `admin`.
 */
export const adminOpsRouter = Router();

const IMPERSONATION_MAX_MINUTES = 60;
const IMPERSONATION_DEFAULT_MINUTES = 15;

/** Sortie d’impersonation — rétablit un jeton admin (auth seule, pas de rôle admin). */
adminOpsRouter.post('/impersonate/exit', requireAuth, async (req, res) => {
  const impersonatorId = req.auth!.impersonatorId;
  if (!impersonatorId) {
    return res.status(400).json({ error: 'Aucune impersonation active' });
  }

  const admin = await prisma.strkProfile.findUnique({
    where: { id: impersonatorId },
    select: {
      id: true,
      role: true,
      institutionId: true,
      groupId: true,
      isActive: true,
      email: true,
      firstName: true,
      lastName: true,
      mfaEnabled: true,
    },
  });
  if (!admin || !admin.isActive || admin.role !== 'admin') {
    return res.status(403).json({ error: 'Compte impersonateur invalide' });
  }

  const { createSession } = await import('../lib/sessions.js');
  const { signAccessToken } = await import('../lib/jwt.js');
  const { logAudit } = await import('../lib/audit.js');

  await prisma.strkSession.updateMany({
    where: { id: req.auth!.sid, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const session = await createSession({
    userId: admin.id,
    userAgent: req.headers['user-agent']?.slice(0, 500),
    ipAddress: req.ip,
  });
  const token = signAccessToken({
    sub: admin.id,
    role: admin.role,
    institutionId: admin.institutionId,
    groupId: admin.groupId,
    sid: session.id,
  });

  await logAudit({
    institutionId: req.auth!.institutionId,
    actorId: admin.id,
    action: 'admin.impersonate.exit',
    targetType: 'user',
    targetId: req.auth!.sub,
    ipAddress: req.ip,
  });

  res.json({ token, user: admin });
});

adminOpsRouter.use(requireAuth, requireRole('admin'));

/** Statut bootstrap (sans secrets) — true si vars encore présentes ou marqueur actif. */
adminOpsRouter.get('/bootstrap/status', async (_req, res) => {
  const { countActiveAdmins, readBootstrapMarker } = await import('../lib/bootstrapAdmin.js');
  const marker = await readBootstrapMarker();
  const envPresent = !!(process.env.BOOTSTRAP_ADMIN_EMAIL || process.env.BOOTSTRAP_ADMIN_PASSWORD);
  res.json({
    envConfigured: envPresent,
    activeAdminCount: await countActiveAdmins(),
    bootstrapMarker: marker
      ? { email: marker.email, profileId: marker.profileId, createdAt: marker.createdAt }
      : null,
    recommendation: envPresent
      ? 'Retirez BOOTSTRAP_ADMIN_* du .env après création du vrai super-admin, puis POST /admin/bootstrap/retire'
      : marker
        ? 'Marqueur bootstrap encore présent — POST /admin/bootstrap/retire pour désactiver le compte temporaire'
        : 'OK',
  });
});

/** Désactive le compte bootstrap marqué (exige un autre admin actif). */
adminOpsRouter.post('/bootstrap/retire', async (req, res) => {
  try {
    const { retireBootstrapAdmin } = await import('../lib/bootstrapAdmin.js');
    const result = await retireBootstrapAdmin(req.auth!.sub);
    res.json({ ok: true, ...result });
  } catch (e) {
    return res.status(409).json({ error: e instanceof Error ? e.message : 'Retrait impossible' });
  }
});

adminOpsRouter.get('/search', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) {
    return res.status(400).json({ error: 'Requête trop courte (min. 2 caractères)' });
  }
  const take = Math.min(Number(req.query.limit) || 20, 50);
  const [users, institutions] = await Promise.all([
    prisma.strkProfile.findMany({
      where: {
        OR: [
          { email: { contains: q, mode: 'insensitive' } },
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        institutionId: true,
        isActive: true,
      },
      take,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.strkInstitution.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, type: true, email: true, featureOverrides: true },
      take,
      orderBy: { name: 'asc' },
    }),
  ]);
  res.json({ query: q, users, institutions });
});

adminOpsRouter.get('/ops-metrics', requirePlatformPerm('ops'), async (_req, res) => {
  let totalRequests = 0;
  let total5xx = 0;
  let durationSum = 0;
  let durationCount = 0;

  try {
    const metrics = await registry.getMetricsAsJSON();
    for (const metric of metrics) {
      if (!Array.isArray(metric.values)) continue;
      if (metric.name === 'http_requests_total') {
        for (const v of metric.values) {
          const n = Number(v.value) || 0;
          totalRequests += n;
          if (String(v.labels?.status_code ?? '').startsWith('5')) total5xx += n;
        }
      }
      if (metric.name === 'http_request_duration_seconds') {
        for (const v of metric.values) {
          const name = String((v as { metricName?: string }).metricName || metric.name);
          if (name.endsWith('_sum')) durationSum += Number(v.value) || 0;
          if (name.endsWith('_count')) durationCount += Number(v.value) || 0;
        }
      }
    }
  } catch {
    // optional
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [commsQueued, commsFailed24h, failedLogins24h] = await Promise.all([
    prisma.strkCommunicationLog.count({ where: { status: 'queued' } }),
    prisma.strkCommunicationLog.count({
      where: { status: 'failed', failedAt: { gte: since } },
    }),
    prisma.strkAuditLog.count({
      where: { action: { in: ['auth.login.failed', 'auth.mfa.failed'] }, createdAt: { gte: since } },
    }),
  ]);

  const snapshot = {
    timestamp: new Date().toISOString(),
    http: {
      totalRequests,
      total5xx,
      errorRate: totalRequests > 0 ? total5xx / totalRequests : 0,
      avgLatencyMs: durationCount > 0 ? (durationSum / durationCount) * 1000 : null,
    },
    jobs: {
      processRole: getProcessRole(),
      httpEnabled: shouldServeHttp(),
      jobsEnabled: shouldRunJobs(),
      queueStarted: isQueueStarted(),
    },
    communications: {
      queued: commsQueued,
      failedLast24h: commsFailed24h,
    },
    security: {
      failedAuthLast24h: failedLogins24h,
    },
  };

  // Anneau en mémoire (process) — historique court multi-refresh, pas multi-instance.
  const hist = (globalThis as { __cnOpsHist?: typeof snapshot[] }).__cnOpsHist ?? [];
  hist.push(snapshot);
  while (hist.length > 48) hist.shift();
  (globalThis as { __cnOpsHist?: typeof snapshot[] }).__cnOpsHist = hist;

  // Snapshot durable pour page status publique (best-effort).
  void prisma.strkSetting
    .upsert({
      where: { category_key: { category: 'system', key: 'publicStatusSnapshot' } },
      create: {
        category: 'system',
        key: 'publicStatusSnapshot',
        value: {
          ...snapshot,
          history: hist.slice(-24).map((h) => ({
            timestamp: h.timestamp,
            errorRate: h.http.errorRate,
            total5xx: h.http.total5xx,
          })),
        },
        description: 'Dernier snapshot ops pour /status',
        isPublic: true,
      },
      update: {
        value: {
          ...snapshot,
          history: hist.slice(-24).map((h) => ({
            timestamp: h.timestamp,
            errorRate: h.http.errorRate,
            total5xx: h.http.total5xx,
          })),
        },
      },
    })
    .catch(() => undefined);

  res.json({ ...snapshot, history: hist.slice(-24) });
});

/** Registre simplifié des traitements (RoPA MVP). */
adminOpsRouter.get('/ropa', async (_req, res) => {
  const [setting, meta] = await Promise.all([
    prisma.strkSetting.findUnique({
      where: { category_key: { category: 'system', key: 'ropaRegister' } },
      select: { value: true },
    }),
    prisma.strkSetting.findUnique({
      where: { category_key: { category: 'system', key: 'ropaRegisterMeta' } },
      select: { value: true },
    }),
  ]);
  const custom = Array.isArray(setting?.value) ? setting!.value : null;
  const defaults = [
    {
      id: 'auth',
      purpose: 'Authentification et sessions',
      legalBasis: 'Exécution du contrat / intérêt légitime sécurité',
      dataCategories: ['identifiants', 'journaux de connexion'],
      retention: 'Sessions actives + audit',
    },
    {
      id: 'scolarity',
      purpose: 'Suivi scolaire (notes, absences, emplois du temps)',
      legalBasis: 'Mission d’intérêt public / contrat établissement',
      dataCategories: ['données élèves', 'parents', 'enseignants'],
      retention: 'Durée scolarité + obligations légales',
    },
    {
      id: 'billing',
      purpose: 'Facturation SaaS et scolarité',
      legalBasis: 'Exécution du contrat',
      dataCategories: ['coordonnées', 'paiements', 'factures'],
      retention: 'Obligations comptables',
    },
    {
      id: 'comms',
      purpose: 'Communications multicanal',
      legalBasis: 'Intérêt légitime / consentement canal',
      dataCategories: ['email', 'téléphone', 'préférences'],
      retention: 'Logs COM + opt-out',
    },
  ];
  const metaVal = (meta?.value as { version?: number; exportedAt?: string } | null) ?? {};
  res.json({
    entries: custom ?? defaults,
    version: metaVal.version ?? 0,
    exportedAt: metaVal.exportedAt ?? null,
  });
});

const ropaEntrySchema = z.object({
  id: z.string().min(1).max(64),
  purpose: z.string().min(1).max(300),
  legalBasis: z.string().min(1).max(300),
  dataCategories: z.array(z.string().min(1).max(120)).min(1).max(30),
  retention: z.string().min(1).max(300),
});

/** Persiste le registre RoPA (settings system/ropaRegister) avec version. */
adminOpsRouter.put('/ropa', async (req, res) => {
  const parsed = z.object({ entries: z.array(ropaEntrySchema).min(1).max(50) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const existing = await prisma.strkSetting.findUnique({
    where: { category_key: { category: 'system', key: 'ropaRegisterMeta' } },
    select: { value: true },
  });
  const prevVersion = Number((existing?.value as { version?: number } | null)?.version) || 0;
  const version = prevVersion + 1;
  const exportedAt = new Date().toISOString();
  await prisma.strkSetting.upsert({
    where: { category_key: { category: 'system', key: 'ropaRegister' } },
    create: {
      category: 'system',
      key: 'ropaRegister',
      value: parsed.data.entries as object,
      description: 'Registre des traitements (RoPA)',
      isPublic: false,
    },
    update: { value: parsed.data.entries as object },
  });
  await prisma.strkSetting.upsert({
    where: { category_key: { category: 'system', key: 'ropaRegisterMeta' } },
    create: {
      category: 'system',
      key: 'ropaRegisterMeta',
      value: { version, exportedAt },
      description: 'Métadonnées RoPA',
      isPublic: false,
    },
    update: { value: { version, exportedAt } },
  });
  res.json({ entries: parsed.data.entries, version, exportedAt });
});

/** Alertes Super Admin masquées (partagées entre admins via settings). */
adminOpsRouter.get('/dismissed-alerts', async (_req, res) => {
  const setting = await prisma.strkSetting.findUnique({
    where: { category_key: { category: 'system', key: 'dismissedAlerts' } },
    select: { value: true },
  });
  const ids = Array.isArray((setting?.value as { ids?: string[] } | null)?.ids)
    ? ((setting!.value as { ids: string[] }).ids)
    : [];
  res.json({ ids });
});

adminOpsRouter.put('/dismissed-alerts', async (req, res) => {
  const parsed = z.object({ ids: z.array(z.string().min(1).max(120)).max(200) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  await prisma.strkSetting.upsert({
    where: { category_key: { category: 'system', key: 'dismissedAlerts' } },
    create: {
      category: 'system',
      key: 'dismissedAlerts',
      value: { ids: parsed.data.ids },
      description: 'Alertes ops masquées (console Super Admin)',
      isPublic: false,
    },
    update: { value: { ids: parsed.data.ids } },
  });
  res.json({ ids: parsed.data.ids });
});

/** Journal communications échouées / en file (ops). */
adminOpsRouter.get('/communications', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : 'failed';
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  if (!['failed', 'queued'].includes(status)) {
    return res.status(400).json({ error: 'status=failed|queued' });
  }
  const logs = await prisma.strkCommunicationLog.findMany({
    where: { status: status as 'failed' | 'queued' },
    orderBy: { requestedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      channel: true,
      status: true,
      subject: true,
      useCase: true,
      errorMessage: true,
      requestedAt: true,
      failedAt: true,
      recipientId: true,
      institutionId: true,
      toAddress: true,
    },
  });
  res.json({ logs, status, count: logs.length });
});

/** Relance une communication failed → queued + file. */
adminOpsRouter.post('/communications/:id/retry', async (req, res) => {
  const log = await prisma.strkCommunicationLog.findUnique({ where: { id: req.params.id } });
  if (!log) return res.status(404).json({ error: 'Journal introuvable' });
  if (log.status !== 'failed') {
    return res.status(400).json({ error: 'Seules les communications failed peuvent être relancées' });
  }
  await prisma.strkCommunicationLog.update({
    where: { id: log.id },
    data: { status: 'queued', failedAt: null, errorMessage: null },
  });
  const { enqueueCommunicationDispatch } = await import('../lib/queue.js');
  await enqueueCommunicationDispatch(log.id);
  res.json({ ok: true, id: log.id, status: 'queued' });
});

/** Purge des journaux failed plus vieux que N jours (défaut 30). */
adminOpsRouter.post('/communications/purge-failed', async (req, res) => {
  const days = Math.min(Math.max(Number(req.body?.olderThanDays) || 30, 1), 365);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await prisma.strkCommunicationLog.deleteMany({
    where: { status: 'failed', failedAt: { lt: cutoff } },
  });
  res.json({ deleted: result.count, olderThanDays: days, cutoff: cutoff.toISOString() });
});

/** Destinataires campagne multi-tenant (filtre rôle + établissements). */
adminOpsRouter.get('/campaign-recipients', async (req, res) => {
  const role = typeof req.query.role === 'string' ? req.query.role : '';
  const rawIds = typeof req.query.institutionIds === 'string' ? req.query.institutionIds : '';
  const institutionIds = rawIds
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!role || institutionIds.length === 0) {
    return res.status(400).json({ error: 'role et institutionIds requis' });
  }
  const users = await prisma.strkProfile.findMany({
    where: {
      role: role as any,
      isActive: true,
      institutionId: { in: institutionIds },
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      institutionId: true,
    },
    take: 2000,
    orderBy: { email: 'asc' },
  });
  res.json({ users, count: users.length });
});

/** Envoi campagne batch (file communications) — admin only. */
adminOpsRouter.post('/campaign-send', async (req, res) => {
  const schema = z.object({
    recipientIds: z.array(z.string().uuid()).min(1).max(500),
    channel: z.enum(['email', 'sms', 'whatsapp', 'push']),
    subject: z.string().optional(),
    body: z.string().min(1),
    useCase: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }

  const { queueCommunication } = await import('../lib/communications.js');
  let ok = 0;
  let fail = 0;
  const errors: Array<{ recipientId: string; error: string }> = [];

  for (const recipientId of parsed.data.recipientIds) {
    const result = await queueCommunication({
      recipientId,
      channel: parsed.data.channel,
      subject: parsed.data.subject,
      body: parsed.data.body,
      useCase: parsed.data.useCase || 'platform_campaign',
      requestedBy: req.auth!.sub,
      institutionId: req.auth!.institutionId,
    });
    if (result.ok) ok += 1;
    else {
      fail += 1;
      errors.push({ recipientId, error: result.error });
    }
  }

  res.status(202).json({ ok, fail, errors: errors.slice(0, 20) });
});

/** Impersonation support — time-boxed, auditée, jamais d’admin cible. */
adminOpsRouter.post('/impersonate', requirePlatformPerm('support'), async (req, res) => {
  if (req.auth!.impersonatorId) {
    return res.status(400).json({ error: 'Déjà en impersonation — terminez d’abord la session courante' });
  }
  const schema = z.object({
    userId: z.string().uuid(),
    durationMinutes: z.number().int().min(5).max(IMPERSONATION_MAX_MINUTES).optional(),
    /** Motif obligatoire (ops / conformité). */
    reason: z.string().trim().min(10).max(500),
    /** Lien optionnel vers un ticket support. */
    supportTicketId: z.string().uuid().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  if (parsed.data.userId === req.auth!.sub) {
    return res.status(400).json({ error: 'Impossible de s’impersonner soi-même' });
  }

  if (parsed.data.supportTicketId) {
    const ticket = await prisma.strkSupportTicket.findUnique({
      where: { id: parsed.data.supportTicketId },
      select: { id: true },
    });
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket support introuvable' });
    }
  }

  const target = await prisma.strkProfile.findUnique({
    where: { id: parsed.data.userId },
    select: {
      id: true,
      role: true,
      institutionId: true,
      groupId: true,
      isActive: true,
      email: true,
      firstName: true,
      lastName: true,
      mfaEnabled: true,
    },
  });
  if (!target || !target.isActive) {
    return res.status(404).json({ error: 'Utilisateur introuvable ou inactif' });
  }
  if (target.role === 'admin') {
    return res.status(403).json({ error: 'Impersonation d’un admin global interdite' });
  }

  const minutes = parsed.data.durationMinutes ?? IMPERSONATION_DEFAULT_MINUTES;
  const expiresIn = `${minutes}m`;
  const { createSession } = await import('../lib/sessions.js');
  const { signAccessToken } = await import('../lib/jwt.js');
  const { logAudit } = await import('../lib/audit.js');

  const session = await createSession({
    userId: target.id,
    userAgent: `impersonation:${req.auth!.sub}`.slice(0, 500),
    ipAddress: req.ip,
    expiresIn,
  });

  const token = signAccessToken(
    {
      sub: target.id,
      role: target.role,
      institutionId: target.institutionId,
      groupId: target.groupId,
      sid: session.id,
      impersonatorId: req.auth!.sub,
    },
    expiresIn
  );

  await logAudit({
    institutionId: target.institutionId,
    actorId: req.auth!.sub,
    action: 'admin.impersonate.start',
    targetType: 'user',
    targetId: target.id,
    metadata: {
      durationMinutes: minutes,
      targetRole: target.role,
      reason: parsed.data.reason,
      supportTicketId: parsed.data.supportTicketId ?? null,
    },
    ipAddress: req.ip,
  });

  res.json({
    token,
    expiresInMinutes: minutes,
    expiresAt: session.expiresAt.toISOString(),
    user: target,
    impersonatorId: req.auth!.sub,
  });
});

/** KPIs financiers SaaS (MRR / churn) depuis la base abonnements. */
adminOpsRouter.get('/billing-metrics', requirePlatformPerm('billing'), async (_req, res) => {
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [activeSubs, cancelledLast30, createdLast30, allForMrr] = await Promise.all([
    prisma.premiumSubscription.count({ where: { status: { in: ['active', 'trial'] } } }),
    prisma.premiumSubscription.count({
      where: { status: 'cancelled', updatedAt: { gte: since30 } },
    }),
    prisma.premiumSubscription.count({
      where: { createdAt: { gte: since30 }, status: { in: ['active', 'trial'] } },
    }),
    prisma.premiumSubscription.findMany({
      where: { status: { in: ['active', 'trial'] } },
      select: { id: true, status: true, plan_: { select: { priceMonthly: true, name: true } } },
    }),
  ]);

  const mrr = allForMrr.reduce((sum, s) => sum + Number(s.plan_?.priceMonthly ?? 0), 0);
  const activeStartApprox = activeSubs + cancelledLast30 - createdLast30;
  const churnRate =
    activeStartApprox > 0 ? cancelledLast30 / Math.max(activeStartApprox, 1) : cancelledLast30 > 0 ? 1 : 0;

  const withStripe = await prisma.premiumSubscription.count({
    where: { stripeSubscriptionId: { not: null } },
  });

  res.json({
    generatedAt: now.toISOString(),
    mrr,
    arr: mrr * 12,
    activeSubscriptions: activeSubs,
    newSubscriptions30d: createdLast30,
    cancelledSubscriptions30d: cancelledLast30,
    churnRate30d: Math.round(churnRate * 1000) / 1000,
    stripeLinkedCount: withStripe,
    notice:
      'MRR = somme priceMonthly des abonnements active/trial en base. Churn = annulés 30j / (actifs+annulés-nouveaux). Sync Stripe optionnelle via POST /subscriptions/:id/admin/sync-stripe.',
  });
});

/** Télémétrie produit minimale — agrégats StrkActivity type product.*. */
adminOpsRouter.get('/product-telemetry', async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 90);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await prisma.strkActivity.groupBy({
    by: ['type'],
    where: { type: { startsWith: 'product.' }, createdAt: { gte: since } },
    _count: { _all: true },
  });
  const features = rows
    .map((r) => ({
      feature: r.type.replace(/^product\./, ''),
      count: r._count._all,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 40);

  const total = features.reduce((s, f) => s + f.count, 0);
  res.json({ days, since: since.toISOString(), totalEvents: total, features });
});

// --- §2.4 SaaS ops extensions ---

adminOpsRouter.get('/dunning-queue', async (_req, res) => {
  const { listDunningQueue } = await import('../lib/dunning.js');
  res.json({ items: await listDunningQueue() });
});

adminOpsRouter.post('/dunning-run', async (_req, res) => {
  const { runDunningReminders } = await import('../lib/dunning.js');
  res.json(await runDunningReminders());
});

adminOpsRouter.get('/audit-retention', async (_req, res) => {
  const { getAuditRetentionConfig } = await import('../lib/auditRetention.js');
  res.json(await getAuditRetentionConfig());
});

adminOpsRouter.put('/audit-retention', async (req, res) => {
  const parsed = z
    .object({
      days: z.number().int().min(30).max(3650).optional(),
      enabled: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const { setAuditRetentionConfig, runAuditRetentionPurge } = await import('../lib/auditRetention.js');
  const cfg = await setAuditRetentionConfig(parsed.data);
  res.json(cfg);
});

adminOpsRouter.post('/audit-retention/purge', async (_req, res) => {
  const { runAuditRetentionPurge } = await import('../lib/auditRetention.js');
  res.json(await runAuditRetentionPurge());
});

adminOpsRouter.get('/overage-policy', async (_req, res) => {
  const { getOveragePolicy } = await import('../lib/overagePolicy.js');
  res.json(await getOveragePolicy());
});

adminOpsRouter.put('/overage-policy', async (req, res) => {
  const parsed = z.object({ mode: z.enum(['hard_block', 'warn_only']) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const { setOveragePolicy } = await import('../lib/overagePolicy.js');
  res.json(await setOveragePolicy(parsed.data.mode));
});

adminOpsRouter.get('/quota-warnings', async (_req, res) => {
  const { listInstitutionsNearQuota } = await import('../lib/overagePolicy.js');
  res.json({ institutions: await listInstitutionsNearQuota() });
});

adminOpsRouter.get('/platform-ops-acl', async (_req, res) => {
  const { getPlatformOpsAcl, ALL_PLATFORM_OPS_SCOPES } = await import('../lib/platformOps.js');
  res.json({ acl: await getPlatformOpsAcl(), scopes: ALL_PLATFORM_OPS_SCOPES });
});

adminOpsRouter.put('/platform-ops-acl', async (req, res) => {
  const parsed = z
    .object({
      acl: z.record(z.string().uuid(), z.array(z.enum(['support', 'billing', 'security', 'ops']))),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const { setPlatformOpsAcl } = await import('../lib/platformOps.js');
  res.json({ acl: await setPlatformOpsAcl(parsed.data.acl) });
});

adminOpsRouter.get('/me/scopes', async (req, res) => {
  const { getScopesForAdmin } = await import('../lib/platformOps.js');
  res.json({ scopes: await getScopesForAdmin(req.auth!.sub) });
});

adminOpsRouter.post('/campaign-schedule', async (req, res) => {
  const schema = z.object({
    scheduledAt: z.string().datetime(),
    recipientIds: z.array(z.string().uuid()).min(1).max(500),
    channel: z.enum(['email', 'sms', 'whatsapp', 'push']),
    subject: z.string().optional(),
    body: z.string().min(1),
    useCase: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const { enqueueScheduledCampaign } = await import('../lib/campaignSchedule.js');
  const campaign = await enqueueScheduledCampaign({
    scheduledAt: parsed.data.scheduledAt,
    recipientIds: parsed.data.recipientIds,
    channel: parsed.data.channel,
    subject: parsed.data.subject || '',
    body: parsed.data.body,
    useCase: parsed.data.useCase,
    createdBy: req.auth!.sub,
  });
  res.status(201).json({ campaign });
});

adminOpsRouter.get('/campaign-schedule', async (_req, res) => {
  const { listScheduledCampaigns } = await import('../lib/campaignSchedule.js');
  res.json({ items: await listScheduledCampaigns() });
});

adminOpsRouter.get('/campaign-delivery-report', async (_req, res) => {
  const { campaignDeliveryReport } = await import('../lib/campaignSchedule.js');
  res.json(await campaignDeliveryReport());
});

/** §5.16 P2 — file messages contact public → ops support. */
adminOpsRouter.get('/contact-messages', requirePlatformPerm('support'), async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : 'new';
  const where = status === 'all' ? {} : { status };
  const messages = await prisma.strkContactMessage.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ messages });
});

adminOpsRouter.patch('/contact-messages/:id', requirePlatformPerm('support'), async (req, res) => {
  const parsed = z
    .object({ status: z.enum(['new', 'acknowledged', 'converted', 'closed']) })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const existing = await prisma.strkContactMessage.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: 'Message introuvable' });
  }
  const message = await prisma.strkContactMessage.update({
    where: { id: existing.id },
    data: {
      status: parsed.data.status,
      handledAt: new Date(),
      handledBy: req.auth!.sub,
    },
  });
  res.json({ message });
});

adminOpsRouter.post('/contact-messages/:id/convert', requirePlatformPerm('support'), async (req, res) => {
  const existing = await prisma.strkContactMessage.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: 'Message introuvable' });
  }
  if (existing.convertedTicketId) {
    const ticket = await prisma.strkSupportTicket.findUnique({ where: { id: existing.convertedTicketId } });
    return res.json({ ticket, message: existing, alreadyConverted: true });
  }

  const ticket = await prisma.strkSupportTicket.create({
    data: {
      institutionId: null,
      createdBy: req.auth!.sub,
      assignedTo: req.auth!.sub,
      subject: `[Contact] ${existing.subject}`,
      priority: 'normal',
      status: 'open',
    },
  });
  await prisma.strkSupportTicketMessage.create({
    data: {
      ticketId: ticket.id,
      authorId: req.auth!.sub,
      body: `Message public converti.\n\nDe : ${existing.name} <${existing.email}>\n\n${existing.message}`,
      isInternal: false,
    },
  });
  const message = await prisma.strkContactMessage.update({
    where: { id: existing.id },
    data: {
      status: 'converted',
      convertedTicketId: ticket.id,
      handledAt: new Date(),
      handledBy: req.auth!.sub,
    },
  });

  const { logAudit } = await import('../lib/audit.js');
  await logAudit({
    actorId: req.auth!.sub,
    action: 'contact.converted_to_ticket',
    targetType: 'contact_message',
    targetId: existing.id,
    metadata: { ticketId: ticket.id, email: existing.email },
    ipAddress: req.ip,
  });

  res.status(201).json({ ticket, message });
});
