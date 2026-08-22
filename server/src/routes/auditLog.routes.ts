import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { isGlobalAdmin, isSameInstitution } from '../lib/authz.js';

/**
 * IAM-005 : consultation du journal d'audit — écriture réservée au serveur
 * lui-même (`lib/audit.ts`), aucune route de création n'est exposée ici.
 */
export const auditLogRouter = Router();
auditLogRouter.use(requireAuth);

auditLogRouter.get('/', requireRole('admin', 'school_admin'), async (req, res) => {
  const institutionId = typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined;
  const action = typeof req.query.action === 'string' ? req.query.action : undefined;
  const from = typeof req.query.from === 'string' ? new Date(req.query.from) : undefined;
  const to = typeof req.query.to === 'string' ? new Date(req.query.to) : undefined;
  const format = req.query.format === 'csv' ? 'csv' : 'json';
  const maxLimit = isGlobalAdmin(req.auth!) ? 5000 : 500;
  const limit = Math.min(Number(req.query.limit) || (format === 'csv' ? 1000 : 100), maxLimit);

  if (institutionId) {
    if (!isSameInstitution(req.auth!, institutionId)) {
      return res.status(403).json({ error: 'Permissions insuffisantes' });
    }
  } else if (!isGlobalAdmin(req.auth!)) {
    if (!req.auth!.institutionId) {
      return res.status(403).json({ error: 'Permissions insuffisantes' });
    }
  }

  const createdAtFilter =
    from || to
      ? {
          ...(from && !Number.isNaN(from.getTime()) ? { gte: from } : {}),
          ...(to && !Number.isNaN(to.getTime()) ? { lte: to } : {}),
        }
      : undefined;

  const logs = await prisma.strkAuditLog.findMany({
    where: {
      institutionId: institutionId ?? (isGlobalAdmin(req.auth!) ? undefined : req.auth!.institutionId!),
      action: action ? { startsWith: action } : undefined,
      ...(createdAtFilter && Object.keys(createdAtFilter).length ? { createdAt: createdAtFilter } : {}),
    },
    include: {
      actor: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
      institution: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  if (format === 'csv') {
    const header = ['createdAt', 'action', 'actorEmail', 'institution', 'targetType', 'targetId', 'ipAddress'];
    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = logs.map((log) =>
      [
        log.createdAt.toISOString(),
        log.action,
        log.actor?.email || '',
        log.institution?.name || '',
        log.targetType || '',
        log.targetId || '',
        log.ipAddress || '',
      ]
        .map((c) => escape(String(c)))
        .join(',')
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
    return res.send([header.join(','), ...rows].join('\n'));
  }

  res.json({ logs, count: logs.length, limit });
});
