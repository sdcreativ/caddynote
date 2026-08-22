import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { isSameInstitution } from '../lib/authz.js';
import { computeEffectiveOccurrences } from '../lib/scheduling.js';

/**
 * PER-003 : disponibilités/indisponibilités enseignant. Ne crée jamais
 * automatiquement d'exception d'emploi du temps (ACA-005) — cf. commentaire
 * sur `StrkTeacherAvailability` dans schema.prisma.
 */
export const teacherAvailabilityRouter = Router();
teacherAvailabilityRouter.use(requireAuth);

const availabilitySchema = z.object({
  teacherId: z.string().uuid(),
  institutionId: z.string().uuid(),
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().optional(),
});

teacherAvailabilityRouter.post('/', requireRole('admin', 'school_admin', 'teacher'), async (req, res) => {
  const parsed = availabilitySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  if (!isSameInstitution(req.auth!, parsed.data.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const isStaff = ['admin', 'school_admin'].includes(req.auth!.role);
  // Un enseignant ne déclare que pour lui-même ; la direction peut déclarer
  // pour n'importe quel enseignant de son établissement.
  if (!isStaff && parsed.data.teacherId !== req.auth!.sub) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  if (new Date(parsed.data.endDate) < new Date(parsed.data.startDate)) {
    return res.status(400).json({ error: 'La date de fin doit être postérieure à la date de début' });
  }
  const availability = await prisma.strkTeacherAvailability.create({
    data: {
      institutionId: parsed.data.institutionId,
      teacherId: parsed.data.teacherId,
      startDate: new Date(parsed.data.startDate),
      endDate: new Date(parsed.data.endDate),
      reason: parsed.data.reason,
      // La direction a déjà l'autorité de la décider en la créant elle-même ;
      // une déclaration par l'enseignant lui-même reste soumise à validation.
      status: isStaff ? 'approved' : 'requested',
      reviewedBy: isStaff ? req.auth!.sub : null,
      reviewedAt: isStaff ? new Date() : null,
    },
  });
  res.status(201).json({ availability });
});

const statusFilterSchema = z.enum(['requested', 'approved', 'rejected']);

teacherAvailabilityRouter.get('/', async (req, res) => {
  const { teacherId, institutionId, status } = req.query;
  const statusFilter = typeof status === 'string' ? statusFilterSchema.safeParse(status) : undefined;
  if (statusFilter && !statusFilter.success) {
    return res.status(400).json({ error: 'Statut invalide' });
  }

  if (typeof teacherId === 'string') {
    if (teacherId !== req.auth!.sub) {
      const teacher = await prisma.strkProfile.findUnique({ where: { id: teacherId }, select: { institutionId: true } });
      if (!teacher || !isSameInstitution(req.auth!, teacher.institutionId)) {
        return res.status(403).json({ error: 'Permissions insuffisantes' });
      }
    }
    const availabilities = await prisma.strkTeacherAvailability.findMany({
      where: { teacherId, status: statusFilter?.success ? statusFilter.data : undefined },
      orderBy: { startDate: 'desc' },
    });
    return res.json({ availabilities });
  }

  if (typeof institutionId === 'string') {
    if (!isSameInstitution(req.auth!, institutionId)) {
      return res.status(403).json({ error: 'Permissions insuffisantes' });
    }
    const availabilities = await prisma.strkTeacherAvailability.findMany({
      where: { institutionId, status: statusFilter?.success ? statusFilter.data : undefined },
      orderBy: { startDate: 'desc' },
    });
    return res.json({ availabilities });
  }

  return res.status(400).json({ error: 'teacherId ou institutionId requis' });
});

const reviewSchema = z.object({ status: z.enum(['approved', 'rejected']) });

teacherAvailabilityRouter.patch('/:id/status', requireRole('admin', 'school_admin'), async (req, res) => {
  const availability = await prisma.strkTeacherAvailability.findUnique({ where: { id: req.params.id } });
  if (!availability) {
    return res.status(404).json({ error: 'Déclaration introuvable' });
  }
  if (!isSameInstitution(req.auth!, availability.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  if (availability.status !== 'requested') {
    return res.status(409).json({ error: 'Cette déclaration a déjà été traitée' });
  }
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const updated = await prisma.strkTeacherAvailability.update({
    where: { id: req.params.id },
    data: { status: parsed.data.status, reviewedBy: req.auth!.sub, reviewedAt: new Date() },
  });
  res.json({ availability: updated });
});

// Créneaux planifiés de l'enseignant qui tombent dans sa période
// d'indisponibilité — signale ce qui nécessite un remplacement/une
// annulation (action manuelle, cf. POST /schedules/:id/exceptions), sans
// jamais le faire à sa place.
teacherAvailabilityRouter.get('/:id/conflicts', async (req, res) => {
  const availability = await prisma.strkTeacherAvailability.findUnique({ where: { id: req.params.id } });
  if (!availability) {
    return res.status(404).json({ error: 'Déclaration introuvable' });
  }
  const isSelf = availability.teacherId === req.auth!.sub;
  if (!isSelf && !isSameInstitution(req.auth!, availability.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const occurrences = await computeEffectiveOccurrences({
    institutionId: availability.institutionId,
    teacherId: availability.teacherId,
    from: availability.startDate,
    to: availability.endDate,
  });
  res.json({
    conflicts: occurrences.map((o) => ({ ...o, needsAction: o.status === 'normal' })),
  });
});
