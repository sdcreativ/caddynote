import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getStudentAccess, isSameInstitution } from '../lib/authz.js';
import { findScheduleConflicts, computeEffectiveOccurrences, type ScheduleCandidate } from '../lib/scheduling.js';
import { computeTeacherWorkload } from '../lib/teacherWorkload.js';
import { logAudit } from '../lib/audit.js';

export const schedulesRouter = Router();
schedulesRouter.use(requireAuth);

const SCHEDULE_INCLUDE = {
  course: {
    select: {
      id: true,
      name: true,
      description: true,
      room: true,
      teacher: { select: { profile: { select: { firstName: true, lastName: true } } } },
    },
  },
  class: { select: { name: true } },
  teacher: { select: { firstName: true, lastName: true } },
};

const ORDER_BY = [{ dayOfWeek: 'asc' as const }, { startTime: 'asc' as const }];

schedulesRouter.get('/', async (req, res) => {
  const { studentId, teacherId, classId, institutionId, dayOfWeek } = req.query;

  if (typeof institutionId === 'string') {
    if (!isSameInstitution(req.auth!, institutionId)) {
      return res.status(403).json({ error: 'Permissions insuffisantes' });
    }
    const day =
      typeof dayOfWeek === 'string' && dayOfWeek !== ''
        ? Number(dayOfWeek)
        : typeof dayOfWeek === 'number'
          ? dayOfWeek
          : null;
    const schedules = await prisma.strkSchedule.findMany({
      where: {
        institutionId,
        isActive: true,
        ...(day != null && Number.isInteger(day) && day >= 0 && day <= 6 ? { dayOfWeek: day } : {}),
      },
      include: SCHEDULE_INCLUDE,
      orderBy: ORDER_BY,
      take: 500,
    });
    return res.json({ schedules });
  }

  if (typeof studentId === 'string') {
    // ORG-004 : sans ce contrôle, n'importe quel compte authentifié pouvait
    // lire l'emploi du temps (enseignants, salles, cours) d'un élève de
    // n'importe quel établissement en devinant/énumérant un id.
    const access = await getStudentAccess(req.auth!, studentId);
    if (!access.allowed) {
      return res.status(403).json({ error: 'Permissions insuffisantes' });
    }
    // L'emploi du temps d'un élève = celui de sa classe active.
    const student = await prisma.strkStudent.findUnique({ where: { id: studentId } });
    if (!student) {
      return res.json({ schedules: [] });
    }
    const schedules = await prisma.strkSchedule.findMany({
      where: { classId: student.classId ?? '__none__', isActive: true },
      include: SCHEDULE_INCLUDE,
      orderBy: ORDER_BY,
    });
    return res.json({ schedules });
  }

  if (typeof teacherId === 'string') {
    // Même principe que grades.routes.ts : un enseignant consulte librement
    // son propre emploi du temps ; celui d'un tiers n'est visible qu'au
    // personnel du même établissement (ORG-004).
    if (teacherId !== req.auth!.sub) {
      const teacher = await prisma.strkProfile.findUnique({ where: { id: teacherId }, select: { institutionId: true } });
      if (!teacher || !isSameInstitution(req.auth!, teacher.institutionId)) {
        return res.status(403).json({ error: 'Permissions insuffisantes' });
      }
    }
    const schedules = await prisma.strkSchedule.findMany({
      where: { teacherId, isActive: true },
      include: SCHEDULE_INCLUDE,
      orderBy: ORDER_BY,
    });
    return res.json({ schedules });
  }

  if (typeof classId === 'string') {
    const klass = await prisma.strkClass.findUnique({ where: { id: classId }, select: { institutionId: true } });
    if (!klass || !isSameInstitution(req.auth!, klass.institutionId)) {
      return res.status(403).json({ error: 'Permissions insuffisantes' });
    }
    const schedules = await prisma.strkSchedule.findMany({
      where: { classId, isActive: true },
      include: SCHEDULE_INCLUDE,
      orderBy: ORDER_BY,
    });
    return res.json({ schedules });
  }

  return res.status(400).json({ error: 'studentId, teacherId, classId ou institutionId requis' });
});

const scheduleSchema = z.object({
  courseId: z.string().uuid(),
  classId: z.string().uuid().optional(),
  institutionId: z.string().uuid(),
  teacherId: z.string().uuid().optional(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string(),
  endTime: z.string(),
  room: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  recurringWeeks: z.number().int().optional(),
  // ACA-004 : un conflit détecté bloque par défaut (409) ; `force` permet un
  // dépassement délibéré (ex. co-intervention voulue dans une même salle),
  // tracé dans le journal d'audit plutôt que silencieusement autorisé.
  force: z.boolean().optional(),
});

const toCandidate = (data: z.infer<typeof scheduleSchema>): ScheduleCandidate => ({
  institutionId: data.institutionId,
  dayOfWeek: data.dayOfWeek,
  startTime: data.startTime,
  endTime: data.endTime,
  teacherId: data.teacherId,
  room: data.room,
  classId: data.classId,
  startDate: data.startDate ? new Date(data.startDate) : null,
  endDate: data.endDate ? new Date(data.endDate) : null,
});

// ACA-004 : détection de conflits (même enseignant, salle ou classe sur un
// créneau qui se recoupe) — appelable à part pour prévisualiser avant de
// soumettre le formulaire de création/modification.
schedulesRouter.post('/check-conflicts', requireRole('admin', 'school_admin'), async (req, res) => {
  const parsed = scheduleSchema.omit({ force: true }).partial({ courseId: true }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  if (!isSameInstitution(req.auth!, parsed.data.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const excludeScheduleId = typeof req.query.excludeId === 'string' ? req.query.excludeId : undefined;
  const conflicts = await findScheduleConflicts(toCandidate(parsed.data as z.infer<typeof scheduleSchema>), excludeScheduleId);
  res.json({ conflicts });
});

schedulesRouter.post('/', requireRole('admin', 'school_admin'), async (req, res) => {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  if (!isSameInstitution(req.auth!, parsed.data.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const conflicts = await findScheduleConflicts(toCandidate(parsed.data));
  if (conflicts.length > 0 && !parsed.data.force) {
    return res.status(409).json({ error: 'Conflit d’emploi du temps détecté', conflicts });
  }
  const { force, ...data } = parsed.data;
  const schedule = await prisma.strkSchedule.create({ data, include: SCHEDULE_INCLUDE });
  if (conflicts.length > 0) {
    await logAudit({
      institutionId: parsed.data.institutionId,
      actorId: req.auth!.sub,
      action: 'schedule.conflict_forced',
      targetType: 'schedule',
      targetId: schedule.id,
      metadata: { conflicts: conflicts.map((c) => ({ scheduleId: c.scheduleId, reasons: c.reasons })) },
      ipAddress: req.ip,
    });
  }
  res.status(201).json({ schedule, conflicts });
});

const duplicateSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  room: z.string().optional(),
  teacherId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  force: z.boolean().optional(),
});

// ACA-003 : duplication d'un créneau — reprend course/classe/salle/horaire
// d'un créneau existant comme point de départ, avec la possibilité de
// n'écraser que certains champs (ex. « ce cours a lieu aussi le mercredi à
// la même heure » : ne changer que dayOfWeek). Repasse par la même
// détection de conflits que la création normale — un duplicata n'est pas
// exempté des règles.
schedulesRouter.post('/:id/duplicate', requireRole('admin', 'school_admin'), async (req, res) => {
  const source = await prisma.strkSchedule.findUnique({ where: { id: req.params.id } });
  if (!source || !isSameInstitution(req.auth!, source.institutionId)) {
    return res.status(404).json({ error: 'Créneau introuvable' });
  }
  const parsed = duplicateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const candidateData: z.infer<typeof scheduleSchema> = {
    courseId: source.courseId,
    classId: source.classId ?? undefined,
    institutionId: source.institutionId,
    teacherId: source.teacherId ?? undefined,
    dayOfWeek: source.dayOfWeek,
    startTime: source.startTime,
    endTime: source.endTime,
    room: source.room ?? undefined,
    startDate: source.startDate?.toISOString(),
    endDate: source.endDate?.toISOString(),
    recurringWeeks: source.recurringWeeks ?? undefined,
    ...parsed.data,
  };
  const conflicts = await findScheduleConflicts(toCandidate(candidateData));
  if (conflicts.length > 0 && !parsed.data.force) {
    return res.status(409).json({ error: 'Conflit d’emploi du temps détecté', conflicts });
  }
  const { force, ...data } = candidateData;
  const schedule = await prisma.strkSchedule.create({ data, include: SCHEDULE_INCLUDE });
  res.status(201).json({ schedule, conflicts });
});

schedulesRouter.patch('/:id', requireRole('admin', 'school_admin'), async (req, res) => {
  const schedule = await prisma.strkSchedule.findUnique({ where: { id: req.params.id } });
  if (!schedule) {
    return res.status(404).json({ error: 'Créneau introuvable' });
  }
  if (!isSameInstitution(req.auth!, schedule.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const parsed = scheduleSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const merged = toCandidate({
    courseId: schedule.courseId,
    institutionId: schedule.institutionId,
    dayOfWeek: schedule.dayOfWeek,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    classId: schedule.classId ?? undefined,
    teacherId: schedule.teacherId ?? undefined,
    room: schedule.room ?? undefined,
    startDate: schedule.startDate?.toISOString(),
    endDate: schedule.endDate?.toISOString(),
    ...parsed.data,
  });
  const conflicts = await findScheduleConflicts(merged, schedule.id);
  if (conflicts.length > 0 && !parsed.data.force) {
    return res.status(409).json({ error: 'Conflit d’emploi du temps détecté', conflicts });
  }
  const { force, ...data } = parsed.data;
  const updated = await prisma.strkSchedule.update({
    where: { id: req.params.id },
    data,
    include: SCHEDULE_INCLUDE,
  });
  if (conflicts.length > 0) {
    await logAudit({
      institutionId: schedule.institutionId,
      actorId: req.auth!.sub,
      action: 'schedule.conflict_forced',
      targetType: 'schedule',
      targetId: schedule.id,
      metadata: { conflicts: conflicts.map((c) => ({ scheduleId: c.scheduleId, reasons: c.reasons })) },
      ipAddress: req.ip,
    });
  }
  res.json({ schedule: updated, conflicts });
});

schedulesRouter.delete('/:id', requireRole('admin', 'school_admin'), async (req, res) => {
  const schedule = await prisma.strkSchedule.findUnique({ where: { id: req.params.id } });
  if (!schedule || !isSameInstitution(req.auth!, schedule.institutionId)) {
    return res.status(404).json({ error: 'Créneau introuvable' });
  }
  await prisma.strkSchedule.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// --- ACA-005 : exceptions ponctuelles (annulation/remplacement) ---

const exceptionSchema = z
  .object({
    date: z.string(),
    type: z.enum(['cancelled', 'substituted']),
    substituteTeacherId: z.string().uuid().optional(),
    reason: z.string().optional(),
  })
  .refine((data) => data.type !== 'substituted' || !!data.substituteTeacherId, {
    message: 'substituteTeacherId requis pour un remplacement',
    path: ['substituteTeacherId'],
  });

schedulesRouter.post('/:id/exceptions', requireRole('admin', 'school_admin'), async (req, res) => {
  const schedule = await prisma.strkSchedule.findUnique({ where: { id: req.params.id } });
  if (!schedule) {
    return res.status(404).json({ error: 'Créneau introuvable' });
  }
  if (!isSameInstitution(req.auth!, schedule.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const parsed = exceptionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  if (parsed.data.substituteTeacherId) {
    const substitute = await prisma.strkProfile.findUnique({
      where: { id: parsed.data.substituteTeacherId },
      select: { institutionId: true },
    });
    if (!substitute || !isSameInstitution(req.auth!, substitute.institutionId)) {
      return res.status(400).json({ error: 'Enseignant remplaçant invalide pour cet établissement' });
    }
  }
  const date = new Date(parsed.data.date);
  const exception = await prisma.strkScheduleException.upsert({
    where: { scheduleId_date: { scheduleId: schedule.id, date } },
    create: {
      scheduleId: schedule.id,
      institutionId: schedule.institutionId,
      date,
      type: parsed.data.type,
      substituteTeacherId: parsed.data.type === 'substituted' ? parsed.data.substituteTeacherId : null,
      reason: parsed.data.reason,
      createdBy: req.auth!.sub,
    },
    update: {
      type: parsed.data.type,
      substituteTeacherId: parsed.data.type === 'substituted' ? parsed.data.substituteTeacherId : null,
      reason: parsed.data.reason,
      createdBy: req.auth!.sub,
    },
  });
  await logAudit({
    institutionId: schedule.institutionId,
    actorId: req.auth!.sub,
    action: parsed.data.type === 'cancelled' ? 'schedule.occurrence_cancelled' : 'schedule.occurrence_substituted',
    targetType: 'schedule',
    targetId: schedule.id,
    metadata: { date: parsed.data.date, substituteTeacherId: parsed.data.substituteTeacherId },
    ipAddress: req.ip,
  });
  res.status(201).json({ exception });
});

schedulesRouter.get('/:id/exceptions', async (req, res) => {
  const schedule = await prisma.strkSchedule.findUnique({ where: { id: req.params.id } });
  if (!schedule) {
    return res.status(404).json({ error: 'Créneau introuvable' });
  }
  if (!isSameInstitution(req.auth!, schedule.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const exceptions = await prisma.strkScheduleException.findMany({
    where: { scheduleId: schedule.id },
    orderBy: { date: 'asc' },
    include: { substituteTeacher: { select: { id: true, firstName: true, lastName: true } } },
  });
  res.json({ exceptions });
});

schedulesRouter.delete('/exceptions/:exceptionId', requireRole('admin', 'school_admin'), async (req, res) => {
  const exception = await prisma.strkScheduleException.findUnique({ where: { id: req.params.exceptionId } });
  if (!exception) {
    return res.status(404).json({ error: 'Exception introuvable' });
  }
  if (!isSameInstitution(req.auth!, exception.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  await prisma.strkScheduleException.delete({ where: { id: exception.id } });
  res.json({ success: true });
});

// --- Occurrences effectives (créneaux récurrents + exceptions appliquées) ---

schedulesRouter.get('/effective', async (req, res) => {
  const { institutionId, classId, teacherId, from, to } = req.query;
  if (typeof institutionId !== 'string' || typeof from !== 'string' || typeof to !== 'string') {
    return res.status(400).json({ error: 'institutionId, from et to requis' });
  }
  if (typeof classId !== 'string' && typeof teacherId !== 'string') {
    return res.status(400).json({ error: 'classId ou teacherId requis' });
  }
  if (!isSameInstitution(req.auth!, institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
    return res.status(400).json({ error: 'Période invalide' });
  }
  const occurrences = await computeEffectiveOccurrences({
    institutionId,
    classId: typeof classId === 'string' ? classId : undefined,
    teacherId: typeof teacherId === 'string' ? teacherId : undefined,
    from: fromDate,
    to: toDate,
  });
  res.json({ occurrences });
});

// PER-004 : charge horaire prévue/réalisée — un enseignant consulte
// librement la sienne, le personnel de direction celle de n'importe quel
// enseignant de son établissement (ORG-004).
schedulesRouter.get('/workload', async (req, res) => {
  const { institutionId, teacherId, from, to } = req.query;
  if (typeof institutionId !== 'string' || typeof teacherId !== 'string' || typeof from !== 'string' || typeof to !== 'string') {
    return res.status(400).json({ error: 'institutionId, teacherId, from et to requis' });
  }
  if (!isSameInstitution(req.auth!, institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  if (teacherId !== req.auth!.sub && !['admin', 'school_admin'].includes(req.auth!.role)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
    return res.status(400).json({ error: 'Période invalide' });
  }
  const workload = await computeTeacherWorkload({ institutionId, teacherId, from: fromDate, to: toDate });
  res.json({ workload });
});
