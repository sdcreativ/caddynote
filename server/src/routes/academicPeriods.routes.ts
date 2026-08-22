import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { isSameInstitution } from '../lib/authz.js';

/**
 * EVA-004 : découpage de l'année scolaire en périodes (trimestres,
 * semestres...) par établissement — prérequis du moteur de calcul de
 * moyennes/rangs (lib/gradeEngine.ts), qui calcule toujours "sur une
 * période" et jamais toutes notes confondues.
 */
export const academicPeriodsRouter = Router();
academicPeriodsRouter.use(requireAuth);

academicPeriodsRouter.get('/', async (req, res) => {
  const institutionId = typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined;
  if (!institutionId || !isSameInstitution(req.auth!, institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const where: { institutionId: string; academicYear?: string } = { institutionId };
  if (typeof req.query.academicYear === 'string') {
    where.academicYear = req.query.academicYear;
  }
  const periods = await prisma.strkAcademicPeriod.findMany({ where, orderBy: { order: 'asc' } });
  res.json({ periods });
});

academicPeriodsRouter.get('/:id', async (req, res) => {
  const period = await prisma.strkAcademicPeriod.findUnique({ where: { id: req.params.id } });
  if (!period || !isSameInstitution(req.auth!, period.institutionId)) {
    return res.status(404).json({ error: 'Période introuvable' });
  }
  res.json({ period });
});

const periodSchema = z.object({
  institutionId: z.string().uuid(),
  academicYear: z.string().min(1),
  name: z.string().min(1),
  order: z.number().int().positive(),
  startDate: z.string(),
  endDate: z.string(),
});

academicPeriodsRouter.post('/', requireRole('admin', 'school_admin'), async (req, res) => {
  const parsed = periodSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  if (!isSameInstitution(req.auth!, parsed.data.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  if (new Date(parsed.data.endDate) <= new Date(parsed.data.startDate)) {
    return res.status(400).json({ error: 'La date de fin doit être postérieure à la date de début' });
  }
  try {
    const period = await prisma.strkAcademicPeriod.create({
      data: {
        institutionId: parsed.data.institutionId,
        academicYear: parsed.data.academicYear,
        name: parsed.data.name,
        order: parsed.data.order,
        startDate: new Date(parsed.data.startDate),
        endDate: new Date(parsed.data.endDate),
      },
    });
    res.status(201).json({ period });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'Une période de ce nom existe déjà pour cette année scolaire' });
    }
    throw error;
  }
});

const updatePeriodSchema = periodSchema.partial().omit({ institutionId: true });

academicPeriodsRouter.patch('/:id', requireRole('admin', 'school_admin'), async (req, res) => {
  const existing = await prisma.strkAcademicPeriod.findUnique({ where: { id: req.params.id } });
  if (!existing || !isSameInstitution(req.auth!, existing.institutionId)) {
    return res.status(404).json({ error: 'Période introuvable' });
  }
  const parsed = updatePeriodSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const { startDate, endDate, ...rest } = parsed.data;
  const period = await prisma.strkAcademicPeriod.update({
    where: { id: req.params.id },
    data: {
      ...rest,
      ...(startDate ? { startDate: new Date(startDate) } : {}),
      ...(endDate ? { endDate: new Date(endDate) } : {}),
    },
  });
  res.json({ period });
});

academicPeriodsRouter.delete('/:id', requireRole('admin', 'school_admin'), async (req, res) => {
  const existing = await prisma.strkAcademicPeriod.findUnique({ where: { id: req.params.id } });
  if (!existing || !isSameInstitution(req.auth!, existing.institutionId)) {
    return res.status(404).json({ error: 'Période introuvable' });
  }
  // period_id est nullable côté strk_grades (ON DELETE SET NULL) : la base ne
  // bloquerait pas la suppression toute seule, elle détacherait juste les
  // notes en silence. On refuse explicitement plutôt que de perdre le
  // rattachement de notes déjà saisies pour cette période.
  const [gradeCount, computationCount] = await Promise.all([
    prisma.strkGrade.count({ where: { periodId: req.params.id } }),
    prisma.strkGradeComputation.count({ where: { periodId: req.params.id } }),
  ]);
  if (gradeCount > 0 || computationCount > 0) {
    return res.status(409).json({ error: 'Des notes ou des calculs existent déjà pour cette période, suppression impossible' });
  }
  await prisma.strkAcademicPeriod.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});
