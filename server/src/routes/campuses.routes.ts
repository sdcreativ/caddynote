/**
 * CRUD campuses (sites) d'un établissement.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { isSameInstitution, SECRETARIAT_ROLES } from '../lib/authz.js';
import { logAudit } from '../lib/audit.js';

export const campusesRouter = Router();

const campusBody = z.object({
  code: z.string().min(1).max(64).regex(/^[a-z0-9_]+$/),
  name: z.string().min(1).max(200),
  address: z.string().max(500).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

/** Liste publique pour le parcours admissions. */
campusesRouter.get('/public/:institutionId', async (req, res) => {
  const campuses = await prisma.strkCampus.findMany({
    where: { institutionId: req.params.institutionId, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, code: true, name: true, address: true },
  });
  res.json({ campuses });
});

campusesRouter.use(requireAuth);

campusesRouter.get('/', requireRole(...SECRETARIAT_ROLES, 'parent'), async (req, res) => {
  const institutionId =
    typeof req.query.institutionId === 'string' ? req.query.institutionId : req.auth!.institutionId;
  if (!institutionId || !isSameInstitution(req.auth!, institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const campuses = await prisma.strkCampus.findMany({
    where: { institutionId },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  res.json({ campuses });
});

campusesRouter.post('/', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const institutionId = req.auth!.institutionId;
  if (!institutionId) return res.status(400).json({ error: 'Établissement requis' });
  const parsed = campusBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });

  const campus = await prisma.strkCampus.create({
    data: {
      institutionId,
      code: parsed.data.code,
      name: parsed.data.name,
      address: parsed.data.address ?? null,
      phone: parsed.data.phone ?? null,
      isActive: parsed.data.isActive ?? true,
      sortOrder: parsed.data.sortOrder ?? 0,
    },
  });
  await logAudit({
    institutionId,
    actorId: req.auth!.sub,
    action: 'campus.created',
    targetType: 'campus',
    targetId: campus.id,
  });
  res.status(201).json({ campus });
});

campusesRouter.patch('/:id', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const existing = await prisma.strkCampus.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Campus introuvable' });
  if (!isSameInstitution(req.auth!, existing.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const parsed = campusBody.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Données invalides' });

  const campus = await prisma.strkCampus.update({
    where: { id: existing.id },
    data: parsed.data,
  });
  res.json({ campus });
});
