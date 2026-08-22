import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { isSameInstitution, isGlobalAdmin, SECRETARIAT_ROLES } from '../lib/authz.js';
import { rejectUnlessSameInstitution } from '../lib/httpAuthz.js';
import { importClassesFromCsv } from '../lib/classImport.js';
import { logAudit } from '../lib/audit.js';

export const classesRouter = Router();

classesRouter.use(requireAuth);

const CLASS_INCLUDE = {
  institution: { select: { id: true, name: true } },
  teacher: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { students: true } },
} as const;

/** Absences 30 j + taux d’assiduité moyen + effectifs filles/garçons par classe. */
const enrichClassesWithAttendance = async <T extends { id: string }>(classes: T[]) => {
  if (classes.length === 0) {
    return classes.map((c) => ({
      ...c,
      absences30d: 0,
      attendanceRate: null as number | null,
      genderHeadcount: { female: 0, male: 0, unknown: 0, total: 0 },
    }));
  }

  const classIds = classes.map((c) => c.id);
  const since = new Date();
  since.setDate(since.getDate() - 30);
  since.setHours(0, 0, 0, 0);

  const [avgRates, absenceRows, genderRows] = await Promise.all([
    prisma.strkStudent.groupBy({
      by: ['classId'],
      where: { classId: { in: classIds } },
      _avg: { attendanceRate: true },
    }),
    prisma.strkAbsence.findMany({
      where: {
        date: { gte: since },
        type: 'absence',
        student: { classId: { in: classIds } },
      },
      select: { student: { select: { classId: true } } },
    }),
    prisma.strkStudent.groupBy({
      by: ['classId', 'gender'],
      where: { classId: { in: classIds } },
      _count: { _all: true },
    }),
  ]);

  const rateByClass = new Map(
    avgRates
      .filter((r) => r.classId)
      .map((r) => [
        r.classId as string,
        r._avg.attendanceRate != null ? Math.round(Number(r._avg.attendanceRate) * 10) / 10 : null,
      ])
  );
  const absencesByClass = new Map<string, number>();
  for (const row of absenceRows) {
    const cid = row.student.classId;
    if (!cid) continue;
    absencesByClass.set(cid, (absencesByClass.get(cid) || 0) + 1);
  }

  const genderByClass = new Map<string, { female: number; male: number; unknown: number; total: number }>();
  for (const row of genderRows) {
    if (!row.classId) continue;
    const current = genderByClass.get(row.classId) ?? { female: 0, male: 0, unknown: 0, total: 0 };
    const n = row._count._all;
    current.total += n;
    if (row.gender === 'female') current.female += n;
    else if (row.gender === 'male') current.male += n;
    else current.unknown += n;
    genderByClass.set(row.classId, current);
  }

  return classes.map((c) => ({
    ...c,
    absences30d: absencesByClass.get(c.id) || 0,
    attendanceRate: rateByClass.get(c.id) ?? null,
    genderHeadcount: genderByClass.get(c.id) ?? { female: 0, male: 0, unknown: 0, total: 0 },
  }));
};

classesRouter.get('/', async (req, res) => {
  const { institutionId, teacherId } = req.query;

  if (typeof teacherId === 'string') {
    const classes = await prisma.strkClass.findMany({
      where: { teacherId, isActive: true },
      include: CLASS_INCLUDE,
      orderBy: { name: 'asc' },
    });
    return res.json({ classes: await enrichClassesWithAttendance(classes) });
  }

  if (typeof institutionId === 'string') {
    if (rejectUnlessSameInstitution(res, req.auth!, institutionId)) return;
    const classes = await prisma.strkClass.findMany({
      where: { institutionId, isActive: true },
      include: CLASS_INCLUDE,
      orderBy: { name: 'asc' },
    });
    return res.json({ classes: await enrichClassesWithAttendance(classes) });
  }

  // Vue globale super-admin (console plateforme).
  if (!isGlobalAdmin(req.auth!)) {
    return res.status(400).json({ error: 'institutionId ou teacherId requis' });
  }
  const classes = await prisma.strkClass.findMany({
    where: { isActive: true },
    include: CLASS_INCLUDE,
    orderBy: [{ institution: { name: 'asc' } }, { name: 'asc' }],
    take: 500,
  });
  return res.json({ classes: await enrichClassesWithAttendance(classes) });
});

const classImportSchema = z.object({
  csv: z.string().min(1),
  institutionId: z.string().uuid(),
});

// Chap. 22.1 — import CSV classes (avant /:id pour ne pas capturer "import").
classesRouter.post('/import', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const parsed = classImportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  if (rejectUnlessSameInstitution(res, req.auth!, parsed.data.institutionId)) return;
  const summary = await importClassesFromCsv(parsed.data.csv, parsed.data.institutionId, req.auth!.sub);
  res.json(summary);
});

classesRouter.get('/:id', async (req, res) => {
  const klass = await prisma.strkClass.findUnique({ where: { id: req.params.id }, include: CLASS_INCLUDE });
  if (!klass) {
    return res.status(404).json({ error: 'Classe introuvable' });
  }
  if (rejectUnlessSameInstitution(res, req.auth!, klass.institutionId)) return;
  res.json({ class: klass });
});

const createClassSchema = z.object({
  name: z.string().min(1),
  institutionId: z.string().uuid(),
  teacherId: z.string().uuid().nullable().optional(),
  description: z.string().optional(),
  academicYear: z.string().optional(),
  maxStudents: z.number().int().positive().optional(),
});

classesRouter.post('/', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const parsed = createClassSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  if (rejectUnlessSameInstitution(res, req.auth!, parsed.data.institutionId)) return;
  const klass = await prisma.strkClass.create({ data: parsed.data, include: CLASS_INCLUDE });
  await logAudit({
    institutionId: parsed.data.institutionId,
    actorId: req.auth!.sub,
    action: 'class.created',
    targetType: 'class',
    targetId: klass.id,
    metadata: { name: klass.name },
    ipAddress: req.ip,
  });
  res.status(201).json({ class: klass });
});

const updateClassSchema = createClassSchema.partial().omit({ institutionId: true });

classesRouter.patch('/:id', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const klass = await prisma.strkClass.findUnique({ where: { id: req.params.id } });
  if (!klass) {
    return res.status(404).json({ error: 'Classe introuvable' });
  }
  if (rejectUnlessSameInstitution(res, req.auth!, klass.institutionId)) return;
  const parsed = updateClassSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const updated = await prisma.strkClass.update({
    where: { id: req.params.id },
    data: parsed.data,
    include: CLASS_INCLUDE,
  });
  res.json({ class: updated });
});

// Suppression logique (is_active=false) + détachement effectifs / titulaire.
classesRouter.delete('/:id', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const klass = await prisma.strkClass.findUnique({ where: { id: req.params.id } });
  if (!klass || !isSameInstitution(req.auth!, klass.institutionId)) {
    return res.status(404).json({ error: 'Classe introuvable' });
  }

  await prisma.$transaction(async (tx) => {
    await tx.strkClassStudent.updateMany({
      where: { classId: klass.id, isActive: true },
      data: { isActive: false, endedAt: new Date(), outcome: 'withdrawn' },
    });
    await tx.strkStudent.updateMany({
      where: { classId: klass.id },
      data: { classId: null },
    });
    // Table legacy strk_student_classes — rester cohérent avec le détachement.
    await tx.strkStudentClass.deleteMany({ where: { classId: klass.id } });
    await tx.strkClass.update({
      where: { id: klass.id },
      data: { isActive: false, teacherId: null },
    });
  });

  await logAudit({
    institutionId: klass.institutionId,
    actorId: req.auth!.sub,
    action: 'class.deactivated',
    targetType: 'class',
    targetId: klass.id,
    metadata: { name: klass.name },
    ipAddress: req.ip,
  });
  res.json({ success: true });
});

classesRouter.patch('/:id/teacher', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const klass = await prisma.strkClass.findUnique({ where: { id: req.params.id } });
  if (!klass || !isSameInstitution(req.auth!, klass.institutionId)) {
    return res.status(404).json({ error: 'Classe introuvable' });
  }
  const parsed = z.object({ teacherId: z.string().uuid().nullable() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const updated = await prisma.strkClass.update({
    where: { id: req.params.id },
    data: { teacherId: parsed.data.teacherId },
    include: CLASS_INCLUDE,
  });
  res.json({ class: updated });
});

classesRouter.get('/:id/student-count', async (req, res) => {
  const klass = await prisma.strkClass.findUnique({ where: { id: req.params.id } });
  if (!klass || !isSameInstitution(req.auth!, klass.institutionId)) {
    return res.status(404).json({ error: 'Classe introuvable' });
  }
  const count = await prisma.strkClassStudent.count({ where: { classId: req.params.id, isActive: true } });
  res.json({ count });
});

const currentAcademicYear = () => {
  const year = new Date().getFullYear();
  const month = new Date().getMonth();
  return month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

// Élèves d'une classe (relation StrkStudent.classId + inscriptions actives).
classesRouter.get('/:id/students', async (req, res) => {
  const klass = await prisma.strkClass.findUnique({ where: { id: req.params.id } });
  if (!klass || !isSameInstitution(req.auth!, klass.institutionId)) {
    return res.status(404).json({ error: 'Classe introuvable' });
  }

  const enrollmentRows = await prisma.strkClassStudent.findMany({
    where: { classId: klass.id, isActive: true },
    select: { studentId: true },
  });
  const enrolledIds = enrollmentRows.map((r) => r.studentId);

  const students = await prisma.strkStudent.findMany({
    where: {
      institutionId: klass.institutionId,
      OR: [
        { classId: klass.id },
        ...(enrolledIds.length > 0 ? [{ id: { in: enrolledIds } }] : []),
      ],
    },
    include: {
      profile: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          phoneNumber: true,
          profileImage: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const byId = new Map(students.map((s) => [s.id, s]));
  res.json({ students: [...byId.values()] });
});

classesRouter.post('/:id/students', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const klass = await prisma.strkClass.findUnique({ where: { id: req.params.id } });
  if (!klass || !isSameInstitution(req.auth!, klass.institutionId)) {
    return res.status(404).json({ error: 'Classe introuvable' });
  }
  const parsed = z.object({ studentIds: z.array(z.string().uuid()).min(1).max(100) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }

  const academicYear = klass.academicYear || currentAcademicYear();
  let assigned = 0;
  for (const studentId of parsed.data.studentIds) {
    const student = await prisma.strkStudent.findUnique({ where: { id: studentId } });
    if (!student || student.institutionId !== klass.institutionId) continue;

    await prisma.strkClassStudent.updateMany({
      where: { studentId, isActive: true },
      data: { isActive: false, endedAt: new Date(), outcome: 'promoted' },
    });
    await prisma.strkClassStudent.create({
      data: {
        studentId,
        classId: klass.id,
        academicYear,
        enrollmentDate: new Date(),
        isActive: true,
      },
    });
    await prisma.strkStudent.update({ where: { id: studentId }, data: { classId: klass.id } });
    // Miroir legacy (liste d'appel historique) — idempotent.
    const legacy = await prisma.strkStudentClass.findFirst({
      where: { studentId, classId: klass.id },
    });
    if (!legacy) {
      await prisma.strkStudentClass.create({ data: { studentId, classId: klass.id } });
    }
    assigned += 1;
  }

  res.status(201).json({ assigned });
});

classesRouter.delete('/:id/students/:studentId', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const klass = await prisma.strkClass.findUnique({ where: { id: req.params.id } });
  if (!klass || !isSameInstitution(req.auth!, klass.institutionId)) {
    return res.status(404).json({ error: 'Classe introuvable' });
  }

  const student = await prisma.strkStudent.findUnique({ where: { id: req.params.studentId } });
  if (!student || student.institutionId !== klass.institutionId) {
    return res.status(404).json({ error: 'Élève introuvable' });
  }

  await prisma.strkClassStudent.updateMany({
    where: { studentId: student.id, classId: klass.id, isActive: true },
    data: { isActive: false, endedAt: new Date(), outcome: 'transferred' },
  });
  if (student.classId === klass.id) {
    await prisma.strkStudent.update({ where: { id: student.id }, data: { classId: null } });
  }
  await prisma.strkStudentClass.deleteMany({
    where: { studentId: student.id, classId: klass.id },
  });
  res.json({ success: true });
});