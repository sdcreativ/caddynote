import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { isSameInstitution, TEACHING_ROLES, DIRECTION_ROLES } from '../lib/authz.js';
import {
  rejectUnlessCourseTenant,
  rejectUnlessSameInstitution,
  rejectUnlessStudentAccess,
  sendForbidden,
} from '../lib/httpAuthz.js';
import { computeClassPeriodGrades, getLatestComputations } from '../lib/gradeEngine.js';
import { importGradesFromCsv } from '../lib/gradeImport.js';
import { logAudit } from '../lib/audit.js';

export const gradesRouter = Router();
gradesRouter.use(requireAuth);

const STAFF_ROLES = ['admin', 'school_admin', 'teacher'];

/** EVA-005 : une note "draft" n'est jamais montrée à un élève/parent, quelle
 * que soit la voie d'accès (par élève, par cours...) — seul le personnel de
 * l'établissement peut voir le travail en cours de saisie/correction. */
const applyVisibility = <T extends { status: string }>(grades: T[], role: string): T[] =>
  STAFF_ROLES.includes(role) ? grades : grades.filter((g) => g.status !== 'draft');

// strk_grades n'a aucune contrainte de clé étrangère côté base d'origine
// (fidèlement reproduit dans le schéma Prisma, cf. schema.prisma) : les
// informations de cours/élève/enseignant sont donc rattachées manuellement
// via des requêtes séparées plutôt qu'un `include` Prisma.
const enrichGrades = async <T extends { studentId: string; courseId: string; teacherId: string }>(grades: T[]) => {
  const studentIds = [...new Set(grades.map((g) => g.studentId))];
  const courseIds = [...new Set(grades.map((g) => g.courseId))];

  const [students, courses] = await Promise.all([
    prisma.strkStudent.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, profile: { select: { firstName: true, lastName: true } } },
    }),
    prisma.strkCourse.findMany({ where: { id: { in: courseIds } }, select: { id: true, name: true } }),
  ]);
  const studentById = new Map(students.map((s) => [s.id, s]));
  const courseById = new Map(courses.map((c) => [c.id, c]));

  return grades.map((g) => ({
    ...g,
    student: studentById.get(g.studentId) ?? null,
    course: courseById.get(g.courseId) ?? null,
  }));
};

gradesRouter.get('/', async (req, res) => {
  const { studentId, courseId, teacherId } = req.query;

  if (typeof studentId === 'string') {
    const access = await rejectUnlessStudentAccess(res, req.auth!, studentId, { guardianPermission: 'canViewGrades' });
    if (!access) return;
    const grades = await prisma.strkGrade.findMany({ where: { studentId }, orderBy: { date: 'desc' } });
    return res.json({ grades: await enrichGrades(applyVisibility(grades, req.auth!.role)) });
  }

  if (typeof courseId === 'string') {
    // ORG-004 : sans ce contrôle, un courseId seul suffisait à lister les
    // notes (et noms d'élèves) d'un cours de n'importe quel établissement.
    const institutionId = await rejectUnlessCourseTenant(res, req.auth!, courseId);
    if (!institutionId) return;
    const grades = await prisma.strkGrade.findMany({ where: { courseId }, orderBy: { date: 'desc' } });
    return res.json({ grades: await enrichGrades(applyVisibility(grades, req.auth!.role)) });
  }

  if (typeof teacherId === 'string') {
    // Un enseignant ne consulte que ses propres notes saisies ; le personnel
    // de direction, celles de son établissement.
    if (teacherId !== req.auth!.sub) {
      const teacher = await prisma.strkProfile.findUnique({ where: { id: teacherId }, select: { institutionId: true } });
      if (!teacher) {
        sendForbidden(res);
        return;
      }
      if (rejectUnlessSameInstitution(res, req.auth!, teacher.institutionId)) return;
    }
    const grades = await prisma.strkGrade.findMany({ where: { teacherId }, orderBy: { date: 'desc' } });
    return res.json({ grades: await enrichGrades(applyVisibility(grades, req.auth!.role)) });
  }

  return res.status(400).json({ error: 'studentId, courseId ou teacherId requis' });
});

const gradeSchema = z.object({
  studentId: z.string().uuid(),
  courseId: z.string().uuid(),
  teacherId: z.string().uuid(),
  gradeValue: z.number(),
  maxGrade: z.number().default(20),
  gradeType: z.string().default('exam'),
  title: z.string().min(1),
  description: z.string().optional(),
  date: z.string().optional(),
  // EVA-004 : la période est requise pour toute nouvelle note — sans elle,
  // le moteur de calcul de moyennes n'a aucun moyen de savoir sur quelle
  // période l'agréger.
  periodId: z.string().uuid(),
  // EVA-002 : poids de cette note précise au sein de sa matière.
  coefficient: z.number().positive().default(1),
});

// EVA-003 : seul le personnel enseignant/direction saisit des notes, et
// uniquement pour un cours de son propre établissement — sans ce contrôle,
// n'importe quel enseignant pouvait créer une note pour un élève/cours d'un
// autre établissement (fuite + intégrité ORG-004).
gradesRouter.post('/', requireRole(...TEACHING_ROLES), async (req, res) => {
  const parsed = gradeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const institutionId = await rejectUnlessCourseTenant(res, req.auth!, parsed.data.courseId);
  if (!institutionId) return;
  const period = await prisma.strkAcademicPeriod.findUnique({ where: { id: parsed.data.periodId } });
  if (!period || period.institutionId !== institutionId) {
    return res.status(400).json({ error: 'Période invalide pour cet établissement' });
  }
  // EVA-005 : toute note commence en brouillon, jamais visible d'un
  // élève/parent tant qu'elle n'est pas explicitement publiée.
  const grade = await prisma.strkGrade.create({
    data: { ...parsed.data, date: parsed.data.date ? new Date(parsed.data.date) : undefined, status: 'draft' },
  });
  res.status(201).json({ grade });
});

const bulkGradeSchema = z.object({
  courseId: z.string().uuid(),
  teacherId: z.string().uuid(),
  periodId: z.string().uuid(),
  title: z.string().min(1),
  gradeType: z.string().default('exam'),
  maxGrade: z.number().default(20),
  coefficient: z.number().positive().default(1),
  date: z.string().optional(),
  entries: z.array(z.object({ studentId: z.string().uuid(), gradeValue: z.number() })).min(1),
});

// EVA-003 : saisie en grille — un enseignant remplit une feuille (un cours,
// une période, un devoir) pour toute une classe en un seul envoi, plutôt
// qu'un POST /grades par élève. Mêmes contrôles que la saisie individuelle
// (établissement du cours, validité de la période) plus une vérification
// que chaque élève appartient bien à l'établissement — sans ça, une grille
// mal préparée pouvait injecter des notes pour n'importe quel élève deviné.
gradesRouter.post('/bulk', requireRole(...TEACHING_ROLES), async (req, res) => {
  const parsed = bulkGradeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const institutionId = await rejectUnlessCourseTenant(res, req.auth!, parsed.data.courseId);
  if (!institutionId) return;
  const period = await prisma.strkAcademicPeriod.findUnique({ where: { id: parsed.data.periodId } });
  if (!period || period.institutionId !== institutionId) {
    return res.status(400).json({ error: 'Période invalide pour cet établissement' });
  }

  const { entries, date, ...common } = parsed.data;
  const studentIds = [...new Set(entries.map((e) => e.studentId))];
  const students = await prisma.strkStudent.findMany({
    where: { id: { in: studentIds } },
    select: { id: true, institutionId: true },
  });
  const validStudentIds = new Set(
    students.filter((s) => s.institutionId === institutionId).map((s) => s.id)
  );
  const invalidIds = studentIds.filter((id) => !validStudentIds.has(id));
  if (invalidIds.length > 0) {
    return res.status(400).json({ error: "Un ou plusieurs élèves n'appartiennent pas à cet établissement", invalidIds });
  }

  const parsedDate = date ? new Date(date) : undefined;
  const data = entries.map((entry) => ({
    ...common,
    studentId: entry.studentId,
    gradeValue: entry.gradeValue,
    date: parsedDate,
    status: 'draft' as const,
  }));
  const created = await prisma.strkGrade.createMany({ data });
  res.status(201).json({ count: created.count });
});

const gradeImportSchema = z.object({
  csv: z.string().min(1),
  courseId: z.string().uuid(),
  teacherId: z.string().uuid(),
  periodId: z.string().uuid(),
  title: z.string().min(1),
  gradeType: z.string().optional(),
  maxGrade: z.number().optional(),
  coefficient: z.number().positive().optional(),
  date: z.string().optional(),
});

// EVA-003 : import CSV/tableur — colonnes studentNumber|email + gradeValue.
gradesRouter.post('/import', requireRole(...TEACHING_ROLES), async (req, res) => {
  const parsed = gradeImportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const institutionId = await rejectUnlessCourseTenant(res, req.auth!, parsed.data.courseId);
  if (!institutionId) return;
  const period = await prisma.strkAcademicPeriod.findUnique({ where: { id: parsed.data.periodId } });
  if (!period || period.institutionId !== institutionId) {
    return res.status(400).json({ error: 'Période invalide pour cet établissement' });
  }
  const summary = await importGradesFromCsv(parsed.data.csv, {
    ...parsed.data,
    institutionId,
    actorId: req.auth!.sub,
  });
  res.status(201).json(summary);
});

gradesRouter.patch('/:id', requireRole(...TEACHING_ROLES), async (req, res) => {
  const existing = await prisma.strkGrade.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: 'Note introuvable' });
  }
  const institutionId = await rejectUnlessCourseTenant(res, req.auth!, existing.courseId);
  if (!institutionId) return;
  // EVA-005 : une note publiée ne se modifie plus par cette voie générique —
  // toute correction après publication doit passer par POST /:id/correct,
  // qui conserve l'ancienne valeur au lieu de l'écraser silencieusement.
  if (existing.status !== 'draft') {
    return res.status(409).json({ error: 'Note déjà publiée : utilisez POST /grades/:id/correct pour la corriger' });
  }
  const parsed = gradeSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  if (parsed.data.periodId) {
    const period = await prisma.strkAcademicPeriod.findUnique({ where: { id: parsed.data.periodId } });
    if (!period || period.institutionId !== institutionId) {
      return res.status(400).json({ error: 'Période invalide pour cet établissement' });
    }
  }
  const { date, ...rest } = parsed.data;
  const grade = await prisma.strkGrade.update({
    where: { id: req.params.id },
    data: { ...rest, ...(date ? { date: new Date(date) } : {}) },
  });
  res.json({ grade });
});

gradesRouter.delete('/:id', requireRole(...TEACHING_ROLES), async (req, res) => {
  const existing = await prisma.strkGrade.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: 'Note introuvable' });
  }
  const institutionId = await rejectUnlessCourseTenant(res, req.auth!, existing.courseId);
  if (!institutionId) return;
  // Même principe que PATCH : une note déjà publiée fait partie de
  // l'historique consulté par l'élève/parent, elle ne disparaît plus.
  if (existing.status !== 'draft') {
    return res.status(409).json({ error: 'Impossible de supprimer une note déjà publiée' });
  }
  await prisma.strkGrade.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// --- EVA-005 : workflow de publication ---

const publishSchema = z.object({ courseId: z.string().uuid(), periodId: z.string().uuid() });

/** Un cours n'a pas de contrainte FK réelle sur teacher_id (legacy), donc pas
 * de relation Prisma directe — on va chercher le cours à la main pour
 * vérifier institution + propriétaire. */
const loadCourseForWrite = async (courseId: string) =>
  prisma.strkCourse.findUnique({ where: { id: courseId }, select: { institutionId: true, teacherId: true } });

gradesRouter.post('/publish', requireRole(...TEACHING_ROLES), async (req, res) => {
  const parsed = publishSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const course = await loadCourseForWrite(parsed.data.courseId);
  if (!course) {
    return res.status(404).json({ error: 'Cours introuvable' });
  }
  if (rejectUnlessSameInstitution(res, req.auth!, course.institutionId)) return;
  // Un enseignant ne publie que les notes de ses propres cours ; le
  // personnel de direction peut publier pour n'importe quel cours de
  // l'établissement.
  if (req.auth!.role === 'teacher' && course.teacherId !== req.auth!.sub) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const result = await prisma.strkGrade.updateMany({
    where: { courseId: parsed.data.courseId, periodId: parsed.data.periodId, status: 'draft' },
    data: { status: 'published', publishedAt: new Date(), publishedBy: req.auth!.sub },
  });
  await logAudit({
    institutionId: course.institutionId,
    actorId: req.auth!.sub,
    action: 'grades.published',
    targetType: 'course',
    targetId: parsed.data.courseId,
    metadata: { periodId: parsed.data.periodId, count: result.count },
    ipAddress: req.ip,
  });
  res.json({ published: result.count });
});

// --- EVA-005 : correction d'une note déjà publiée ---

const correctSchema = z.object({ gradeValue: z.number(), description: z.string().optional() });

gradesRouter.post('/:id/correct', requireRole(...TEACHING_ROLES), async (req, res) => {
  const existing = await prisma.strkGrade.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: 'Note introuvable' });
  }
  const course = await loadCourseForWrite(existing.courseId);
  if (!course) {
    return res.status(404).json({ error: 'Cours introuvable' });
  }
  if (rejectUnlessSameInstitution(res, req.auth!, course.institutionId)) return;
  if (req.auth!.role === 'teacher' && course.teacherId !== req.auth!.sub) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  if (existing.status === 'draft') {
    return res.status(400).json({ error: 'Une note en brouillon se modifie directement (PATCH), pas via /correct' });
  }
  const parsed = correctSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const grade = await prisma.strkGrade.update({
    where: { id: req.params.id },
    data: {
      previousValue: existing.gradeValue,
      gradeValue: parsed.data.gradeValue,
      description: parsed.data.description ?? existing.description,
      status: 'corrected',
      correctedAt: new Date(),
      correctedBy: req.auth!.sub,
    },
  });
  res.json({ grade });
});

// --- EVA-004 : moteur de calcul de moyennes/rangs versionné ---

const computeSchema = z.object({ classId: z.string().uuid(), periodId: z.string().uuid() });

// Réservé à la direction : un calcul de rang porte sur toute la classe,
// toutes matières confondues (donc tous les enseignants) — pas une action
// qu'un enseignant isolé doit pouvoir déclencher pour les autres.
gradesRouter.post('/compute', requireRole(...DIRECTION_ROLES), async (req, res) => {
  const parsed = computeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const klass = await prisma.strkClass.findUnique({ where: { id: parsed.data.classId }, select: { institutionId: true } });
  if (!klass || !isSameInstitution(req.auth!, klass.institutionId)) {
    return res.status(404).json({ error: 'Classe introuvable' });
  }
  try {
    const computations = await computeClassPeriodGrades({
      institutionId: klass.institutionId,
      classId: parsed.data.classId,
      periodId: parsed.data.periodId,
      computedBy: req.auth!.sub,
    });
    res.status(201).json({ computations });
  } catch (error: any) {
    const messages: Record<string, string> = {
      PERIOD_NOT_FOUND: 'Période introuvable pour cet établissement',
      CLASS_NOT_FOUND: 'Classe introuvable',
      NO_STUDENTS: 'Cette classe ne compte aucun élève',
      NO_COURSES: 'Cette classe ne compte aucun cours',
      NO_PUBLISHED_GRADES: 'Aucune note publiée pour cette classe sur cette période',
    };
    if (error?.message && messages[error.message]) {
      return res.status(409).json({ error: messages[error.message] });
    }
    throw error;
  }
});

gradesRouter.get('/computations', async (req, res) => {
  const { classId, periodId, studentId } = req.query;
  if (typeof classId !== 'string' || typeof periodId !== 'string') {
    return res.status(400).json({ error: 'classId et periodId requis' });
  }
  const klass = await prisma.strkClass.findUnique({ where: { id: classId }, select: { institutionId: true } });
  if (!klass) {
    return res.status(404).json({ error: 'Classe introuvable' });
  }

  if (STAFF_ROLES.includes(req.auth!.role)) {
    if (rejectUnlessSameInstitution(res, req.auth!, klass.institutionId)) return;
    const computations = await getLatestComputations({
      classId,
      periodId,
      studentId: typeof studentId === 'string' ? studentId : undefined,
    });
    return res.json({ computations });
  }

  // Élève/parent : uniquement les lignes de l'élève concerné, jamais celles
  // de toute la classe (ce qui exposerait le classement nominatif des
  // autres élèves — hors du besoin réel, qui est "ma moyenne / mon rang").
  if (typeof studentId !== 'string') {
    return res.status(400).json({ error: 'studentId requis' });
  }
  const access = await rejectUnlessStudentAccess(res, req.auth!, studentId, { guardianPermission: 'canViewGrades' });
  if (!access) return;
  const computations = await getLatestComputations({ classId, periodId, studentId });
  res.json({ computations });
});

gradesRouter.get('/average', async (req, res) => {
  const { studentId, courseId } = req.query;
  if (typeof studentId !== 'string' || typeof courseId !== 'string') {
    return res.status(400).json({ error: 'studentId et courseId requis' });
  }
  const access = await rejectUnlessStudentAccess(res, req.auth!, studentId, { guardianPermission: 'canViewGrades' });
  if (!access) return;
  // Une moyenne calculée sur des brouillons exposerait indirectement leur
  // valeur à un élève/parent avant publication — toujours exclus ici.
  const grades = await prisma.strkGrade.findMany({
    where: { studentId, courseId, status: { in: ['published', 'corrected'] } },
    select: { gradeValue: true },
  });
  const average = grades.length
    ? grades.reduce((sum, g) => sum + Number(g.gradeValue), 0) / grades.length
    : 0;
  res.json({ average });
});
