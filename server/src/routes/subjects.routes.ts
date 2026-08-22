import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { isSameInstitution } from '../lib/authz.js';

export const subjectsRouter = Router();
subjectsRouter.use(requireAuth);

const getClassInstitutionId = async (classId: string): Promise<string | null> => {
  const klass = await prisma.strkClass.findUnique({ where: { id: classId }, select: { institutionId: true } });
  return klass?.institutionId ?? null;
};

const createSubjectSchema = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  description: z.string().optional(),
  institutionId: z.string().uuid(),
});

subjectsRouter.post('/', requireRole('admin', 'school_admin'), async (req, res) => {
  const parsed = createSubjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  if (!isSameInstitution(req.auth!, parsed.data.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const subject = await prisma.strkSubject.create({ data: parsed.data });
  res.status(201).json({ subject });
});

subjectsRouter.get('/', async (req, res) => {
  const institutionId = typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined;
  if (!institutionId || !isSameInstitution(req.auth!, institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const subjects = await prisma.strkSubject.findMany({ where: { institutionId }, orderBy: { name: 'asc' } });
  res.json({ subjects });
});

const updateSubjectSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().optional(),
  description: z.string().optional(),
});

subjectsRouter.patch('/:id', requireRole('admin', 'school_admin'), async (req, res) => {
  const subject = await prisma.strkSubject.findUnique({ where: { id: req.params.id } });
  if (!subject || !isSameInstitution(req.auth!, subject.institutionId)) {
    return res.status(404).json({ error: 'Matière introuvable' });
  }
  const parsed = updateSubjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const updated = await prisma.strkSubject.update({ where: { id: req.params.id }, data: parsed.data });
  res.json({ subject: updated });
});

subjectsRouter.delete('/:id', requireRole('admin', 'school_admin'), async (req, res) => {
  const subject = await prisma.strkSubject.findUnique({ where: { id: req.params.id } });
  if (!subject || !isSameInstitution(req.auth!, subject.institutionId)) {
    return res.status(404).json({ error: 'Matière introuvable' });
  }
  const classLinks = await prisma.strkClassSubject.count({ where: { subjectId: subject.id } });
  if (classLinks > 0) {
    return res.status(409).json({
      error: 'Cette matière est encore associée à une ou plusieurs classes. Retirez-la des classes avant suppression.',
      code: 'subject_in_use',
      classLinks,
    });
  }
  const courseLinks = await prisma.strkCourse.count({ where: { subjectId: subject.id } });
  if (courseLinks > 0) {
    return res.status(409).json({
      error: 'Cette matière est encore référencée par des cours. Réaffectez ou archivez ces cours avant suppression.',
      code: 'subject_in_use',
      courseLinks,
    });
  }
  await prisma.strkSubject.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// --- Association matière <-> classe (strk_class_subjects) ---

const CLASS_SUBJECT_INCLUDE = {
  subject: true,
  teacher: { select: { id: true, firstName: true, lastName: true } },
} as const;

subjectsRouter.post('/class-subjects', requireRole('admin', 'school_admin'), async (req, res) => {
  const parsed = z
    .object({ classId: z.string().uuid(), subjectId: z.string().uuid(), teacherId: z.string().uuid().optional() })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const institutionId = await getClassInstitutionId(parsed.data.classId);
  if (!institutionId || !isSameInstitution(req.auth!, institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const classSubject = await prisma.strkClassSubject.create({ data: parsed.data, include: CLASS_SUBJECT_INCLUDE });
  res.status(201).json({ classSubject });
});

subjectsRouter.get('/class-subjects/:classId', async (req, res) => {
  const institutionId = await getClassInstitutionId(req.params.classId);
  if (!institutionId || !isSameInstitution(req.auth!, institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const classSubjects = await prisma.strkClassSubject.findMany({
    where: { classId: req.params.classId },
    include: CLASS_SUBJECT_INCLUDE,
  });
  res.json({ classSubjects });
});

subjectsRouter.delete('/class-subjects/:classId/:subjectId', requireRole('admin', 'school_admin'), async (req, res) => {
  const institutionId = await getClassInstitutionId(req.params.classId);
  if (!institutionId || !isSameInstitution(req.auth!, institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  await prisma.strkClassSubject.deleteMany({
    where: { classId: req.params.classId, subjectId: req.params.subjectId },
  });
  res.json({ success: true });
});

// --- Association élève <-> classe historique (strk_student_classes) ---

subjectsRouter.post('/student-classes', requireRole('admin', 'school_admin', 'teacher'), async (req, res) => {
  const parsed = z.object({ studentId: z.string().uuid(), classId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const institutionId = await getClassInstitutionId(parsed.data.classId);
  if (!institutionId || !isSameInstitution(req.auth!, institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const studentClass = await prisma.strkStudentClass.create({ data: parsed.data });
  res.status(201).json({ studentClass });
});

subjectsRouter.delete('/student-classes/:studentId/:classId', requireRole('admin', 'school_admin', 'teacher'), async (req, res) => {
  const institutionId = await getClassInstitutionId(req.params.classId);
  if (!institutionId || !isSameInstitution(req.auth!, institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  await prisma.strkStudentClass.deleteMany({
    where: { studentId: req.params.studentId, classId: req.params.classId },
  });
  res.json({ success: true });
});

subjectsRouter.get('/student-classes/by-class/:classId', async (req, res) => {
  const klass = await prisma.strkClass.findUnique({ where: { id: req.params.classId } });
  if (!klass || !isSameInstitution(req.auth!, klass.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }

  // Source canonique = StrkClassStudent (+ classId élève), pas la table legacy seule.
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
      profile: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  // Forme historique conservée pour les clients (attendance / grades).
  res.json({
    students: students.map((s) => ({
      student: {
        id: s.id,
        firstName: s.profile?.firstName ?? null,
        lastName: s.profile?.lastName ?? null,
        email: s.profile?.email ?? null,
        studentNumber: s.studentNumber ?? null,
      },
    })),
  });
});
