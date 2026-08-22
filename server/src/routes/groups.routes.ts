import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { isGlobalAdmin, isGroupOwnerOf } from '../lib/authz.js';
import type { JwtPayload } from '../lib/jwt.js';

/**
 * ORG-002 : « groupe scolaire » — regroupe plusieurs établissements
 * (`StrkInstitution.groupId`) sous un même réseau, piloté par un ou
 * plusieurs comptes `group_owner` (`StrkProfile.groupId`).
 *
 * Portée volontairement limitée à une vue consolidée en LECTURE :
 * annuaire des établissements membres + statistiques agrégées. Un
 * `group_owner` n'obtient jamais d'accès aux données opérationnelles
 * (élèves, notes, absences...) des établissements de son groupe — celles-ci
 * restent isolées établissement par établissement (ORG-004), gérées par le
 * `school_admin`/personnel de chaque établissement comme aujourd'hui.
 *
 * Créer un groupe et y rattacher/détacher un établissement reste réservé à
 * l'admin global (SDCREATIV) : c'est une action inter-tenant sensible, au
 * même titre que la création d'établissement elle-même (ORG-001).
 */
export const groupsRouter = Router();
groupsRouter.use(requireAuth);

const canReadGroup = (auth: JwtPayload, groupId: string): boolean =>
  isGlobalAdmin(auth) || isGroupOwnerOf(auth, groupId);

groupsRouter.get('/', async (req, res) => {
  if (isGlobalAdmin(req.auth!)) {
    const groups = await prisma.strkInstitutionGroup.findMany({
      include: { _count: { select: { institutions: true, members: true } } },
      orderBy: { name: 'asc' },
    });
    return res.json({ groups });
  }
  if (req.auth!.role === 'group_owner' && req.auth!.groupId) {
    const group = await prisma.strkInstitutionGroup.findUnique({
      where: { id: req.auth!.groupId },
      include: { _count: { select: { institutions: true, members: true } } },
    });
    return res.json({ groups: group ? [group] : [] });
  }
  return res.json({ groups: [] });
});

groupsRouter.get('/:id', async (req, res) => {
  if (!canReadGroup(req.auth!, req.params.id)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const group = await prisma.strkInstitutionGroup.findUnique({ where: { id: req.params.id } });
  if (!group) {
    return res.status(404).json({ error: 'Groupe introuvable' });
  }
  res.json({ group });
});

const groupSchema = z.object({ name: z.string().min(1) });

groupsRouter.post('/', requireRole('admin'), async (req, res) => {
  const parsed = groupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const group = await prisma.strkInstitutionGroup.create({ data: parsed.data });
  res.status(201).json({ group });
});

groupsRouter.patch('/:id', requireRole('admin'), async (req, res) => {
  const parsed = groupSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  try {
    const group = await prisma.strkInstitutionGroup.update({ where: { id: req.params.id }, data: parsed.data });
    res.json({ group });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Groupe introuvable' });
    }
    throw error;
  }
});

groupsRouter.delete('/:id', requireRole('admin'), async (req, res) => {
  const institutionCount = await prisma.strkInstitution.count({ where: { groupId: req.params.id } });
  if (institutionCount > 0) {
    return res.status(400).json({ error: 'Détachez d’abord les établissements de ce groupe avant de le supprimer' });
  }
  try {
    await prisma.strkInstitutionGroup.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Groupe introuvable' });
    }
    throw error;
  }
});

// --- Établissements membres ---

groupsRouter.get('/:id/institutions', async (req, res) => {
  if (!canReadGroup(req.auth!, req.params.id)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const institutions = await prisma.strkInstitution.findMany({
    where: { groupId: req.params.id },
    orderBy: { name: 'asc' },
  });
  res.json({ institutions });
});

const attachInstitutionSchema = z.object({ institutionId: z.string().uuid() });

// Rattachement/détachement : action inter-tenant sensible (ORG-001/002),
// réservée à l'admin global — jamais au `group_owner` lui-même.
groupsRouter.post('/:id/institutions', requireRole('admin'), async (req, res) => {
  const parsed = attachInstitutionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const group = await prisma.strkInstitutionGroup.findUnique({ where: { id: req.params.id } });
  if (!group) {
    return res.status(404).json({ error: 'Groupe introuvable' });
  }
  try {
    const institution = await prisma.strkInstitution.update({
      where: { id: parsed.data.institutionId },
      data: { groupId: group.id },
    });
    res.json({ institution });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Établissement introuvable' });
    }
    throw error;
  }
});

groupsRouter.delete('/:id/institutions/:institutionId', requireRole('admin'), async (req, res) => {
  const updated = await prisma.strkInstitution.updateMany({
    where: { id: req.params.institutionId, groupId: req.params.id },
    data: { groupId: null },
  });
  if (updated.count === 0) {
    return res.status(404).json({ error: 'Cet établissement n’appartient pas à ce groupe' });
  }
  res.json({ success: true });
});

// --- Vue consolidée (statistiques agrégées, ORG-002) ---

groupsRouter.get('/:id/dashboard', async (req, res) => {
  if (!canReadGroup(req.auth!, req.params.id)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const institutions = await prisma.strkInstitution.findMany({
    where: { groupId: req.params.id },
    select: { id: true, name: true },
  });
  const institutionIds = institutions.map((i) => i.id);

  if (institutionIds.length === 0) {
    return res.json({ dashboard: { institutions: [], totals: { students: 0, teachers: 0, classes: 0 } } });
  }

  const [studentCounts, teacherCounts, classCounts] = await Promise.all([
    prisma.strkStudent.groupBy({ by: ['institutionId'], where: { institutionId: { in: institutionIds } }, _count: true }),
    prisma.strkTeacher.groupBy({ by: ['institutionId'], where: { institutionId: { in: institutionIds } }, _count: true }),
    prisma.strkClass.groupBy({
      by: ['institutionId'],
      where: { institutionId: { in: institutionIds }, isActive: true },
      _count: true,
    }),
  ]);
  const byInstitution = <T extends { institutionId: string; _count: number }>(rows: T[]) =>
    new Map(rows.map((r) => [r.institutionId, r._count]));
  const students = byInstitution(studentCounts);
  const teachers = byInstitution(teacherCounts);
  const classes = byInstitution(classCounts);

  const perInstitution = institutions.map((inst) => ({
    institutionId: inst.id,
    name: inst.name,
    students: students.get(inst.id) ?? 0,
    teachers: teachers.get(inst.id) ?? 0,
    classes: classes.get(inst.id) ?? 0,
  }));

  const totals = perInstitution.reduce(
    (acc, i) => ({
      students: acc.students + i.students,
      teachers: acc.teachers + i.teachers,
      classes: acc.classes + i.classes,
    }),
    { students: 0, teachers: 0, classes: 0 }
  );

  res.json({ dashboard: { institutions: perInstitution, totals } });
});
