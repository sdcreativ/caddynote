import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { isSameInstitution, TEACHING_ROLES, SECRETARIAT_ROLES } from '../lib/authz.js';
import { isS3Configured } from '../lib/s3.js';

export const coursesRouter = Router();
coursesRouter.use(requireAuth);

const COURSE_INCLUDE = {
  teacher: { include: { profile: { select: { firstName: true, lastName: true } } } },
  class: { select: { name: true } },
  institution: { select: { name: true } },
};

coursesRouter.get('/', async (req, res) => {
  const { teacherId, institutionId, classId, studentId } = req.query;

  if (typeof teacherId === 'string') {
    const courses = await prisma.strkCourse.findMany({
      where: { teacherId, status: 'active' },
      include: COURSE_INCLUDE,
      orderBy: { name: 'asc' },
    });
    return res.json({ courses });
  }

  // Cours de la classe de l'élève (ou classId explicite).
  let resolvedClassId = typeof classId === 'string' ? classId : null;
  if (!resolvedClassId && typeof studentId === 'string') {
    const student = await prisma.strkStudent.findUnique({
      where: { id: studentId },
      select: { classId: true, institutionId: true },
    });
    if (!student) {
      return res.status(404).json({ error: 'Élève introuvable' });
    }
    if (!isSameInstitution(req.auth!, student.institutionId)) {
      return res.status(403).json({ error: 'Permissions insuffisantes' });
    }
    // Un élève ne peut lister que ses propres cours (sauf personnel).
    if (req.auth!.role === 'student' && req.auth!.sub !== studentId) {
      return res.status(403).json({ error: 'Permissions insuffisantes' });
    }
    resolvedClassId = student.classId;
  }

  if (resolvedClassId) {
    const klass = await prisma.strkClass.findUnique({
      where: { id: resolvedClassId },
      select: { institutionId: true },
    });
    if (!klass) {
      return res.status(404).json({ error: 'Classe introuvable' });
    }
    if (!isSameInstitution(req.auth!, klass.institutionId)) {
      return res.status(403).json({ error: 'Permissions insuffisantes' });
    }
    const courses = await prisma.strkCourse.findMany({
      where: { classId: resolvedClassId, status: 'active' },
      include: COURSE_INCLUDE,
      orderBy: { name: 'asc' },
    });
    return res.json({ courses });
  }

  if (typeof institutionId === 'string') {
    if (!isSameInstitution(req.auth!, institutionId)) {
      return res.status(403).json({ error: 'Permissions insuffisantes' });
    }
    const courses = await prisma.strkCourse.findMany({
      where: { institutionId, status: 'active' },
      include: COURSE_INCLUDE,
      orderBy: { name: 'asc' },
    });
    return res.json({ courses });
  }

  return res.status(400).json({ error: 'institutionId, teacherId, classId ou studentId requis' });
});

coursesRouter.get('/:id', async (req, res) => {
  const course = await prisma.strkCourse.findUnique({ where: { id: req.params.id }, include: COURSE_INCLUDE });
  if (!course) {
    return res.status(404).json({ error: 'Cours introuvable' });
  }
  if (!isSameInstitution(req.auth!, course.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  res.json({ course });
});

const canManageCourseMaterials = (auth: { sub: string; role: string }, course: { teacherId: string | null }): boolean => {
  if (auth.role === 'admin' || auth.role === 'school_admin' || auth.role === 'head_teacher') return true;
  return !!course.teacherId && course.teacherId === auth.sub;
};

coursesRouter.get('/:id/materials', async (req, res) => {
  const course = await prisma.strkCourse.findUnique({ where: { id: req.params.id } });
  if (!course) {
    return res.status(404).json({ error: 'Cours introuvable' });
  }
  if (!isSameInstitution(req.auth!, course.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const materials = await prisma.strkCourseMaterial.findMany({
    where: { courseId: course.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ materials });
});

const lessonSchema = z.object({
  lessonDate: z.string().min(1),
  title: z.string().optional(),
  contentCovered: z.string().min(1),
  homeworkGiven: z.string().optional(),
  assignmentIds: z.array(z.string().uuid()).default([]),
});

// PED-001 : cahier de textes — journal chronologique par séance.
coursesRouter.get('/:id/lessons', async (req, res) => {
  const course = await prisma.strkCourse.findUnique({ where: { id: req.params.id } });
  if (!course) {
    return res.status(404).json({ error: 'Cours introuvable' });
  }
  if (!isSameInstitution(req.auth!, course.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const lessons = await prisma.strkLessonEntry.findMany({
    where: { courseId: course.id },
    orderBy: { lessonDate: 'desc' },
  });
  res.json({ lessons });
});

coursesRouter.post('/:id/lessons', requireRole(...TEACHING_ROLES), async (req, res) => {
  const course = await prisma.strkCourse.findUnique({ where: { id: req.params.id } });
  if (!course || !isSameInstitution(req.auth!, course.institutionId)) {
    return res.status(404).json({ error: 'Cours introuvable' });
  }
  if (!canManageCourseMaterials(req.auth!, course)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const parsed = lessonSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const lesson = await prisma.strkLessonEntry.create({
    data: {
      courseId: course.id,
      lessonDate: new Date(parsed.data.lessonDate),
      title: parsed.data.title,
      contentCovered: parsed.data.contentCovered,
      homeworkGiven: parsed.data.homeworkGiven,
      assignmentIds: parsed.data.assignmentIds,
      createdBy: req.auth!.sub,
    },
  });
  res.status(201).json({ lesson });
});

coursesRouter.patch('/:id/lessons/:lessonId', requireRole(...TEACHING_ROLES), async (req, res) => {
  const course = await prisma.strkCourse.findUnique({ where: { id: req.params.id } });
  if (!course || !isSameInstitution(req.auth!, course.institutionId)) {
    return res.status(404).json({ error: 'Cours introuvable' });
  }
  if (!canManageCourseMaterials(req.auth!, course)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const existing = await prisma.strkLessonEntry.findUnique({ where: { id: req.params.lessonId } });
  if (!existing || existing.courseId !== course.id) {
    return res.status(404).json({ error: 'Séance introuvable' });
  }
  const parsed = lessonSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const { lessonDate, assignmentIds, ...rest } = parsed.data;
  const lesson = await prisma.strkLessonEntry.update({
    where: { id: existing.id },
    data: {
      ...rest,
      ...(lessonDate ? { lessonDate: new Date(lessonDate) } : {}),
      ...(assignmentIds ? { assignmentIds } : {}),
    },
  });
  res.json({ lesson });
});

coursesRouter.delete('/:id/lessons/:lessonId', requireRole(...TEACHING_ROLES), async (req, res) => {
  const course = await prisma.strkCourse.findUnique({ where: { id: req.params.id } });
  if (!course || !isSameInstitution(req.auth!, course.institutionId)) {
    return res.status(404).json({ error: 'Cours introuvable' });
  }
  if (!canManageCourseMaterials(req.auth!, course)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const existing = await prisma.strkLessonEntry.findUnique({ where: { id: req.params.lessonId } });
  if (!existing || existing.courseId !== course.id) {
    return res.status(404).json({ error: 'Séance introuvable' });
  }
  await prisma.strkLessonEntry.delete({ where: { id: existing.id } });
  res.status(204).send();
});

const materialSchema = z.object({
  title: z.string().min(1),
  type: z.string().min(1),
  content: z.string().optional(),
  description: z.string().optional(),
  fileKey: z.string().min(1).optional(),
});

coursesRouter.post('/:id/materials', requireRole(...TEACHING_ROLES), async (req, res) => {
  const course = await prisma.strkCourse.findUnique({ where: { id: req.params.id } });
  if (!course || !isSameInstitution(req.auth!, course.institutionId)) {
    return res.status(404).json({ error: 'Cours introuvable' });
  }
  if (!canManageCourseMaterials(req.auth!, course)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const parsed = materialSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  if (parsed.data.fileKey) {
    if (!parsed.data.fileKey.startsWith('course-materials/')) {
      return res.status(400).json({ error: 'Clé de fichier invalide' });
    }
    if (!isS3Configured()) {
      return res.status(501).json({
        error: "Le stockage de fichiers n'est pas configuré sur cette instance (variables S3_* manquantes).",
      });
    }
  }
  const material = await prisma.strkCourseMaterial.create({
    data: {
      courseId: course.id,
      title: parsed.data.title,
      type: parsed.data.type,
      content: parsed.data.content,
      description: parsed.data.description,
      fileKey: parsed.data.fileKey,
      createdBy: req.auth!.sub,
    },
  });
  res.status(201).json({ material });
});

coursesRouter.delete('/:id/materials/:materialId', requireRole(...TEACHING_ROLES), async (req, res) => {
  const course = await prisma.strkCourse.findUnique({ where: { id: req.params.id } });
  if (!course || !isSameInstitution(req.auth!, course.institutionId)) {
    return res.status(404).json({ error: 'Cours introuvable' });
  }
  if (!canManageCourseMaterials(req.auth!, course)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const material = await prisma.strkCourseMaterial.findUnique({ where: { id: req.params.materialId } });
  if (!material || material.courseId !== course.id) {
    return res.status(404).json({ error: 'Ressource introuvable' });
  }
  await prisma.strkCourseMaterial.delete({ where: { id: material.id } });
  res.json({ success: true });
});

const courseSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  teacherId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  institutionId: z.string().uuid(),
  room: z.string().optional(),
  scheduleDay: z.string().optional(),
  scheduleTime: z.string().optional(),
  duration: z.number().int().positive().optional(),
  status: z.string().optional(),
  // EVA-004 : matière + coefficient utilisés par le moteur de calcul de
  // moyennes/rangs (lib/gradeEngine.ts) pour regrouper et pondérer les
  // notes de ce cours. Facultatifs — un cours peut exister sans être encore
  // rattaché à une matière.
  subjectId: z.string().uuid().nullable().optional(),
  coefficient: z.number().positive().optional(),
});

const validateSubject = async (subjectId: string | null | undefined, institutionId: string): Promise<boolean> => {
  if (!subjectId) return true;
  const subject = await prisma.strkSubject.findUnique({ where: { id: subjectId }, select: { institutionId: true } });
  return !!subject && subject.institutionId === institutionId;
};

coursesRouter.post('/', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const parsed = courseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  if (!isSameInstitution(req.auth!, parsed.data.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  if (!(await validateSubject(parsed.data.subjectId, parsed.data.institutionId))) {
    return res.status(400).json({ error: 'Matière invalide pour cet établissement' });
  }
  try {
    const course = await prisma.strkCourse.create({ data: parsed.data, include: COURSE_INCLUDE });
    res.status(201).json({ course });
  } catch (error) {
    // Défense en profondeur : `teacher_id` référence `strk_teachers`, pas
    // `strk_profiles` (voir lib/roleExtensions.ts) — un id qui ne correspond
    // à aucun compte enseignant renvoyait jusqu'ici un 500 Prisma brut.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return res.status(400).json({ error: "L'enseignant indiqué (teacherId) est introuvable" });
    }
    throw error;
  }
});

const updateCourseSchema = courseSchema.partial().omit({ institutionId: true });

coursesRouter.patch('/:id', requireRole(...TEACHING_ROLES), async (req, res) => {
  const course = await prisma.strkCourse.findUnique({ where: { id: req.params.id } });
  if (!course || !isSameInstitution(req.auth!, course.institutionId)) {
    return res.status(404).json({ error: 'Cours introuvable' });
  }
  const parsed = updateCourseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  if (parsed.data.subjectId !== undefined && !(await validateSubject(parsed.data.subjectId, course.institutionId))) {
    return res.status(400).json({ error: 'Matière invalide pour cet établissement' });
  }
  try {
    const updated = await prisma.strkCourse.update({
      where: { id: req.params.id },
      data: parsed.data,
      include: COURSE_INCLUDE,
    });
    res.json({ course: updated });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return res.status(400).json({ error: "L'enseignant indiqué (teacherId) est introuvable" });
    }
    throw error;
  }
});

// Suppression logique (status='inactive').
coursesRouter.delete('/:id', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const course = await prisma.strkCourse.findUnique({ where: { id: req.params.id } });
  if (!course || !isSameInstitution(req.auth!, course.institutionId)) {
    return res.status(404).json({ error: 'Cours introuvable' });
  }
  await prisma.strkCourse.update({ where: { id: req.params.id }, data: { status: 'inactive' } });
  res.json({ success: true });
});
