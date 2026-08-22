import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getStudentAccess, isSameInstitution, isFollowUpVisible, canViewFollowUpEntry, TEACHING_ROLES } from '../lib/authz.js';
import { logAudit } from '../lib/audit.js';

/**
 * SUI-001/002/005 : observations pédagogiques (chap. 15). SUI-001 ("suivi
 * individuel") est servi par `GET /observations/timeline`, qui réunit
 * observations et incidents disciplinaires plutôt que d'être un modèle à
 * part — le suivi individuel EST la vue chronologique combinée des deux.
 *
 * Écriture réservée aux rôles d’enseignement (`TEACHING_ROLES`) — la vie
 * scolaire (`supervisor`) signale via `/discipline/incidents`, pas ici.
 */
export const observationsRouter = Router();
observationsRouter.use(requireAuth);

const observationSchema = z.object({
  studentId: z.string().uuid(),
  courseId: z.string().uuid().optional(),
  category: z.enum(['positive', 'negative', 'neutral']).default('neutral'),
  title: z.string().min(1),
  description: z.string().min(1),
  date: z.string().optional(),
  // SUI-005 : confidentialité ciblée — cf. lib/authz.ts.
  restrictedToUserIds: z.array(z.string().uuid()).default([]),
  visibleToFamily: z.boolean().default(false),
});

observationsRouter.post('/', requireRole(...TEACHING_ROLES), async (req, res) => {
  const parsed = observationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const student = await prisma.strkStudent.findUnique({ where: { id: parsed.data.studentId } });
  if (!student || !isSameInstitution(req.auth!, student.institutionId)) {
    return res.status(404).json({ error: 'Élève introuvable' });
  }
  if (parsed.data.courseId) {
    const course = await prisma.strkCourse.findUnique({ where: { id: parsed.data.courseId }, select: { institutionId: true } });
    if (!course || course.institutionId !== student.institutionId) {
      return res.status(400).json({ error: 'Cours invalide pour cet établissement' });
    }
  }
  const { date, ...rest } = parsed.data;
  const observation = await prisma.strkPedagogicalObservation.create({
    data: {
      ...rest,
      institutionId: student.institutionId,
      authorId: req.auth!.sub,
      date: date ? new Date(date) : undefined,
    },
  });
  await logAudit({
    institutionId: student.institutionId,
    actorId: req.auth!.sub,
    action: 'observation.created',
    targetType: 'observation',
    targetId: observation.id,
    metadata: { studentId: observation.studentId, category: observation.category },
    ipAddress: req.ip,
  });
  res.status(201).json({ observation });
});

observationsRouter.get('/', async (req, res) => {
  const { studentId } = req.query;
  if (typeof studentId !== 'string') {
    return res.status(400).json({ error: 'studentId requis' });
  }
  const access = await getStudentAccess(req.auth!, studentId);
  if (!access.allowed) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const observations = await prisma.strkPedagogicalObservation.findMany({
    where: { studentId },
    orderBy: { date: 'desc' },
  });
  const visible = observations.filter((o) => isFollowUpVisible(access, req.auth!, o));
  res.json({ observations: visible });
});

// SUI-001 : dossier de suivi individuel — observations et incidents
// disciplinaires réunis en une seule chronologie, chacun filtré par sa
// propre règle de visibilité (SUI-005).
observationsRouter.get('/timeline', async (req, res) => {
  const { studentId } = req.query;
  if (typeof studentId !== 'string') {
    return res.status(400).json({ error: 'studentId requis' });
  }
  const access = await getStudentAccess(req.auth!, studentId);
  if (!access.allowed) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const [observations, incidents] = await Promise.all([
    prisma.strkPedagogicalObservation.findMany({ where: { studentId } }),
    prisma.strkDisciplinaryIncident.findMany({ where: { studentId } }),
  ]);
  const timeline = [
    ...observations
      .filter((o) => isFollowUpVisible(access, req.auth!, o))
      .map((o) => ({ kind: 'observation' as const, date: o.date, entry: o })),
    ...incidents
      .filter((i) => isFollowUpVisible(access, req.auth!, { ...i, authorId: i.reportedBy }))
      .map((i) => ({ kind: 'incident' as const, date: i.date, entry: i })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());
  res.json({ timeline });
});

const updateObservationSchema = observationSchema
  .omit({ studentId: true, courseId: true })
  .partial();

observationsRouter.patch('/:id', requireRole(...TEACHING_ROLES), async (req, res) => {
  const existing = await prisma.strkPedagogicalObservation.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: 'Observation introuvable' });
  }
  if (!isSameInstitution(req.auth!, existing.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  // Seul l'auteur (ou la direction) modifie une observation — un tiers
  // enseignant ne réécrit pas les propos d'un collègue.
  if (req.auth!.role === 'teacher' && existing.authorId !== req.auth!.sub) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const parsed = updateObservationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const { date, ...rest } = parsed.data;
  const observation = await prisma.strkPedagogicalObservation.update({
    where: { id: req.params.id },
    data: { ...rest, ...(date ? { date: new Date(date) } : {}) },
  });
  res.json({ observation });
});

observationsRouter.delete('/:id', requireRole(...TEACHING_ROLES), async (req, res) => {
  const existing = await prisma.strkPedagogicalObservation.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: 'Observation introuvable' });
  }
  if (!isSameInstitution(req.auth!, existing.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  if (req.auth!.role === 'teacher' && existing.authorId !== req.auth!.sub) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  await prisma.strkPedagogicalObservation.delete({ where: { id: req.params.id } });
  await logAudit({
    institutionId: existing.institutionId,
    actorId: req.auth!.sub,
    action: 'observation.deleted',
    targetType: 'observation',
    targetId: req.params.id,
    metadata: { studentId: existing.studentId },
    ipAddress: req.ip,
  });
  res.json({ success: true });
});

observationsRouter.get('/:id', async (req, res) => {
  const observation = await prisma.strkPedagogicalObservation.findUnique({ where: { id: req.params.id } });
  if (!observation) {
    return res.status(404).json({ error: 'Observation introuvable' });
  }
  if (!(await canViewFollowUpEntry(req.auth!, observation))) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  res.json({ observation });
});
