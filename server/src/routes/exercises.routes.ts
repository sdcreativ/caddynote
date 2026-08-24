import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireFeature } from '../middleware/requireFeature.js';
import { getStudentAccess, isGlobalAdmin, isSameInstitution } from '../lib/authz.js';
import type { JwtPayload } from '../lib/jwt.js';
import { isAiConfigured, aiMissingKeyMessage } from '../lib/anthropicClient.js';
import * as aiExercise from '../lib/aiExercise.js';
import { checkQuota, QUOTA_LABELS } from '../lib/quotas.js';
import { logAudit } from '../lib/audit.js';

export const exercisesRouter = Router();
exercisesRouter.use(requireAuth);

// --- Assistant IA (remplace l'edge function Supabase `ai-exercise-helper`) ---
//
// Nécessite ANTHROPIC_API_KEY et/ou OPENAI_API_KEY ; si aucune, réponse 501
// claire plutôt qu'un échec silencieux. La génération manuelle via POST
// /exercises reste possible sans IA.
const requireAiConfigured: import('express').RequestHandler = (_req, res, next) => {
  if (!isAiConfigured()) {
    return res.status(501).json({
      error: aiMissingKeyMessage(),
    });
  }
  next();
};

const generateExerciseSchema = z.object({
  subject: z.string().min(1),
  difficulty: z.number(),
  topic: z.string().min(1),
  questionCount: z.number().int().optional(),
  exerciseType: z.string().optional(),
});

exercisesRouter.post(
  '/ai/generate',
  // Rôle vérifié avant la disponibilité de la fonctionnalité : un élève sans
  // droit sur cette action reçoit un 403 clair, que l'IA soit configurée sur
  // cette instance ou non — l'ordre inverse aurait fait dépendre le code
  // d'erreur (403 vs 501) d'un détail de configuration serveur sans rapport
  // avec ses droits.
  requireRole('teacher', 'admin', 'school_admin'),
  requireFeature('exercises_ai'),
  requireAiConfigured,
  async (req, res) => {
    const parsed = generateExerciseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
    }
    const institutionId = req.auth!.institutionId;
    if (institutionId) {
      const aiQuota = await checkQuota(institutionId, 'aiPerMonth', 1);
      if (!aiQuota.allowed) {
        return res.status(403).json({
          error: `Quota de ${QUOTA_LABELS.aiPerMonth} atteint pour le plan actuel (${aiQuota.current}/${aiQuota.limit}).`,
          code: 'quota_exceeded',
          quota: aiQuota,
        });
      }
    }
    try {
      const result = await aiExercise.generateExercise(parsed.data);
      if (institutionId) {
        await logAudit({
          institutionId,
          actorId: req.auth!.sub,
          action: 'exercises.ai.generate',
          targetType: 'ai_exercise',
          metadata: { subject: parsed.data.subject, topic: parsed.data.topic },
          ipAddress: req.ip,
        });
      }
      res.json(result);
    } catch (err) {
      console.error('AI generateExercise error:', err);
      res.status(502).json({ error: "Échec de la génération par l'IA" });
    }
  },
);

const correctAnswerSchema = z.object({
  question: z.string().min(1),
  studentAnswer: z.string(),
  correctAnswer: z.string(),
  subject: z.string().min(1),
});

exercisesRouter.post('/ai/correct-answer', requireFeature('exercises_ai'), requireAiConfigured, async (req, res) => {
  const parsed = correctAnswerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  try {
    const result = await aiExercise.correctOpenAnswer(parsed.data);
    res.json(result);
  } catch (err) {
    console.error('AI correctOpenAnswer error:', err);
    res.status(502).json({ error: "Échec de la correction par l'IA" });
  }
});

const adaptiveRecommendationsSchema = z.object({
  studentLevel: z.number(),
  weaknesses: z.array(z.string()),
  strengths: z.array(z.string()),
  subject: z.string().min(1),
});

exercisesRouter.post('/ai/adaptive-recommendations', requireFeature('exercises_ai'), requireAiConfigured, async (req, res) => {
  const parsed = adaptiveRecommendationsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  try {
    const result = await aiExercise.getAdaptiveRecommendations(parsed.data);
    res.json(result);
  } catch (err) {
    console.error('AI getAdaptiveRecommendations error:', err);
    res.status(502).json({ error: "Échec de la génération de recommandations par l'IA" });
  }
});

const pedagogicalHelpSchema = z.object({
  question: z.string().min(1),
  studentQuestion: z.string().min(1),
  context: z.string(),
});

exercisesRouter.post('/ai/pedagogical-help', requireFeature('exercises_ai'), requireAiConfigured, async (req, res) => {
  const parsed = pedagogicalHelpSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  try {
    const result = await aiExercise.getPedagogicalHelp(parsed.data);
    res.json(result);
  } catch (err) {
    console.error('AI getPedagogicalHelp error:', err);
    res.status(502).json({ error: "Échec de l'assistance pédagogique par l'IA" });
  }
});

// --- Exercices ---

// GET /exercises : un enseignant voit ses propres exercices ; tout le monde
// d'autre (élève, parent...) ne voit que les exercices publiés de son
// établissement — reproduit le comportement du hook d'origine (filtre sur le
// rôle courant) tout en ajoutant l'isolation multi-établissement qu'assurait
// RLS côté Supabase.
exercisesRouter.get('/', async (req, res) => {
  const auth = req.auth!;
  const where =
    auth.role === 'teacher'
      ? { teacherId: auth.sub }
      : isGlobalAdmin(auth)
        ? { isPublished: true }
        : { isPublished: true, institutionId: auth.institutionId ?? undefined };

  const exercises = await prisma.strkExercise.findMany({
    where,
    include: {
      _count: { select: { questions: true } },
      assignments: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ exercises });
});

/** Un exercice publié est visible dans son propre établissement ; un
 * brouillon (non publié), seulement par son auteur ou le personnel de
 * direction de son établissement — même règle que la liste (GET /), mais
 * jusqu'ici absente de toutes les routes par id (fuite ORG-004 : n'importe
 * quel exercice, y compris non publié et d'un autre établissement, était
 * consultable en devinant son id — questions et corrigés inclus). */
const canAccessExercise = (auth: JwtPayload, exercise: { teacherId: string; institutionId: string; isPublished: boolean | null }): boolean => {
  if (isGlobalAdmin(auth)) return true;
  if (exercise.teacherId === auth.sub) return true;
  if (auth.role === 'school_admin' && isSameInstitution(auth, exercise.institutionId)) return true;
  return !!exercise.isPublished && isSameInstitution(auth, exercise.institutionId);
};

exercisesRouter.get('/:id', async (req, res) => {
  const exercise = await prisma.strkExercise.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { questions: true } }, assignments: true },
  });
  if (!exercise) {
    return res.status(404).json({ error: 'Exercice introuvable' });
  }
  if (!canAccessExercise(req.auth!, exercise)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  res.json({ exercise });
});

const exerciseSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  classId: z.string().uuid().optional(),
  subject: z.string().optional(),
  exerciseType: z.string().default('quiz'),
  difficultyLevel: z.number().int().min(1).max(5).default(1),
  timeLimit: z.number().int().optional(),
  maxAttempts: z.number().int().default(3),
  dueDate: z.string().optional(),
  points: z.number().int().default(100),
  isPublished: z.boolean().optional(),
});

exercisesRouter.post('/', requireRole('teacher', 'admin', 'school_admin'), async (req, res) => {
  const parsed = exerciseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const auth = req.auth!;
  if (!auth.institutionId) {
    return res.status(400).json({ error: "Aucun établissement associé à ce compte" });
  }
  const { dueDate, ...rest } = parsed.data;
  const exercise = await prisma.strkExercise.create({
    data: {
      ...rest,
      teacherId: auth.sub,
      institutionId: auth.institutionId,
      dueDate: dueDate ? new Date(dueDate) : undefined,
    },
  });
  res.status(201).json({ exercise });
});

const requireExerciseOwnerOrStaff = async (req: import('express').Request, res: import('express').Response) => {
  const exercise = await prisma.strkExercise.findUnique({ where: { id: req.params.id } });
  if (!exercise) {
    res.status(404).json({ error: 'Exercice introuvable' });
    return null;
  }
  const auth = req.auth!;
  const isOwner = exercise.teacherId === auth.sub;
  const isStaff = isGlobalAdmin(auth) || (auth.role === 'school_admin' && auth.institutionId === exercise.institutionId);
  if (!isOwner && !isStaff) {
    res.status(403).json({ error: 'Permissions insuffisantes' });
    return null;
  }
  return exercise;
};

exercisesRouter.patch('/:id', requireRole('teacher', 'admin', 'school_admin'), async (req, res) => {
  const existing = await requireExerciseOwnerOrStaff(req, res);
  if (!existing) return;

  const parsed = exerciseSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const { dueDate, ...rest } = parsed.data;
  const exercise = await prisma.strkExercise.update({
    where: { id: req.params.id },
    data: { ...rest, ...(dueDate ? { dueDate: new Date(dueDate) } : {}) },
  });
  res.json({ exercise });
});

exercisesRouter.delete('/:id', requireRole('teacher', 'admin', 'school_admin'), async (req, res) => {
  const existing = await requireExerciseOwnerOrStaff(req, res);
  if (!existing) return;
  await prisma.strkExercise.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// --- Questions ---

exercisesRouter.get('/:id/questions', async (req, res) => {
  const exercise = await prisma.strkExercise.findUnique({ where: { id: req.params.id } });
  if (!exercise) {
    return res.status(404).json({ error: 'Exercice introuvable' });
  }
  // Les questions incluent le corrigé (`correctAnswer`) : mêmes règles
  // d'accès que l'exercice lui-même, jamais un accès libre par id.
  if (!canAccessExercise(req.auth!, exercise)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const questions = await prisma.strkExerciseQuestion.findMany({
    where: { exerciseId: req.params.id },
    orderBy: { questionOrder: 'asc' },
  });
  res.json({ questions });
});

const questionSchema = z.object({
  questionText: z.string().min(1),
  questionType: z.string().default('multiple_choice'),
  options: z.array(z.any()).optional(),
  correctAnswer: z.any().optional(),
  explanation: z.string().optional(),
  points: z.number().int().default(1),
  questionOrder: z.number().int().optional(),
});

exercisesRouter.post('/:id/questions', requireRole('teacher', 'admin', 'school_admin'), async (req, res) => {
  const existing = await requireExerciseOwnerOrStaff(req, res);
  if (!existing) return;
  const parsed = questionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const question = await prisma.strkExerciseQuestion.create({
    data: { ...parsed.data, exerciseId: req.params.id },
  });
  res.status(201).json({ question });
});

/** Résout l'exercice propriétaire d'une question/assignation/tentative et
 * applique les mêmes règles que `requireExerciseOwnerOrStaff` — les routes
 * par sous-ressource (`/questions/:questionId`, `/assignments/:assignmentId`)
 * ne vérifiaient auparavant rien du tout (fuite + intégrité ORG-004). */
const requireQuestionOwnerOrStaff = async (req: import('express').Request, res: import('express').Response) => {
  const question = await prisma.strkExerciseQuestion.findUnique({ where: { id: req.params.questionId } });
  if (!question) {
    res.status(404).json({ error: 'Question introuvable' });
    return null;
  }
  const exercise = await prisma.strkExercise.findUnique({ where: { id: question.exerciseId } });
  const auth = req.auth!;
  const isOwner = exercise?.teacherId === auth.sub;
  const isStaff = !!exercise && (isGlobalAdmin(auth) || (auth.role === 'school_admin' && isSameInstitution(auth, exercise.institutionId)));
  if (!exercise || (!isOwner && !isStaff)) {
    res.status(403).json({ error: 'Permissions insuffisantes' });
    return null;
  }
  return question;
};

exercisesRouter.patch('/questions/:questionId', requireRole('teacher', 'admin', 'school_admin'), async (req, res) => {
  const existing = await requireQuestionOwnerOrStaff(req, res);
  if (!existing) return;
  const parsed = questionSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const question = await prisma.strkExerciseQuestion.update({
    where: { id: req.params.questionId },
    data: parsed.data,
  });
  res.json({ question });
});

exercisesRouter.delete('/questions/:questionId', requireRole('teacher', 'admin', 'school_admin'), async (req, res) => {
  const existing = await requireQuestionOwnerOrStaff(req, res);
  if (!existing) return;
  await prisma.strkExerciseQuestion.delete({ where: { id: req.params.questionId } });
  res.json({ success: true });
});

// --- Assignations ---

exercisesRouter.get('/:id/assignments', async (req, res) => {
  const exercise = await prisma.strkExercise.findUnique({ where: { id: req.params.id } });
  if (!exercise) {
    return res.status(404).json({ error: 'Exercice introuvable' });
  }
  if (!canAccessExercise(req.auth!, exercise)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const assignments = await prisma.strkExerciseAssignment.findMany({
    where: { exerciseId: req.params.id },
    orderBy: { assignedAt: 'desc' },
  });
  res.json({ assignments });
});

const assignmentSchema = z.object({
  assignedToType: z.enum(['class', 'student', 'all']).default('class'),
  assignedToId: z.string().uuid().optional(),
  dueDate: z.string().optional(),
  autoGrade: z.boolean().default(true),
});

exercisesRouter.post('/:id/assignments', requireRole('teacher', 'admin', 'school_admin'), async (req, res) => {
  const existing = await requireExerciseOwnerOrStaff(req, res);
  if (!existing) return;
  const parsed = assignmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const { dueDate, ...rest } = parsed.data;
  const assignment = await prisma.strkExerciseAssignment.create({
    data: {
      ...rest,
      exerciseId: req.params.id,
      assignedBy: req.auth!.sub,
      dueDate: dueDate ? new Date(dueDate) : undefined,
    },
  });
  res.status(201).json({ assignment });
});

exercisesRouter.delete('/assignments/:assignmentId', requireRole('teacher', 'admin', 'school_admin'), async (req, res) => {
  const assignment = await prisma.strkExerciseAssignment.findUnique({ where: { id: req.params.assignmentId } });
  if (!assignment) {
    return res.status(404).json({ error: 'Assignation introuvable' });
  }
  const exercise = await prisma.strkExercise.findUnique({ where: { id: assignment.exerciseId } });
  const auth = req.auth!;
  const isOwner = exercise?.teacherId === auth.sub;
  const isStaff = !!exercise && (isGlobalAdmin(auth) || (auth.role === 'school_admin' && isSameInstitution(auth, exercise.institutionId)));
  if (!exercise || (!isOwner && !isStaff)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  await prisma.strkExerciseAssignment.delete({ where: { id: req.params.assignmentId } });
  res.json({ success: true });
});

// --- Progression (élève) ---

// Un élève ne voit/modifie que sa propre progression ; le personnel
// enseignant/direction peut consulter celle d'un élève auquel il a accès
// (ELV-002 : mêmes règles que pour les notes/absences).
const resolveProgressStudentId = async (
  req: import('express').Request,
  res: import('express').Response,
  requestedStudentId: unknown,
): Promise<string | null> => {
  const auth = req.auth!;
  const studentId = typeof requestedStudentId === 'string' ? requestedStudentId : auth.sub;
  if (studentId === auth.sub) return studentId;

  const access = await getStudentAccess(auth, studentId);
  if (!access.allowed || (access.via === 'guardian' && !access.permissions.canViewGrades)) {
    res.status(403).json({ error: 'Permissions insuffisantes' });
    return null;
  }
  return studentId;
};

exercisesRouter.get('/:id/progress', async (req, res) => {
  const studentId = await resolveProgressStudentId(req, res, req.query.studentId);
  if (!studentId) return;
  const progress = await prisma.strkExerciseProgress.findUnique({
    where: { exerciseId_studentId: { exerciseId: req.params.id, studentId } },
  });
  res.json({ progress });
});

const progressSchema = z.object({
  currentQuestionId: z.string().uuid().optional(),
  questionsAnswered: z.number().int().optional(),
  totalQuestions: z.number().int().optional(),
  progressPercentage: z.number().optional(),
  streakCount: z.number().int().optional(),
  badgesEarned: z.array(z.any()).optional(),
  lastActivity: z.string().optional(),
});

exercisesRouter.patch('/:id/progress', async (req, res) => {
  // La progression est toujours celle de l'utilisateur connecté (comportement
  // du hook d'origine : aucun rôle ne modifie la progression d'un tiers).
  const parsed = progressSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const { lastActivity, ...rest } = parsed.data;
  const data = { ...rest, ...(lastActivity ? { lastActivity: new Date(lastActivity) } : {}) };
  const progress = await prisma.strkExerciseProgress.upsert({
    where: { exerciseId_studentId: { exerciseId: req.params.id, studentId: req.auth!.sub } },
    create: { exerciseId: req.params.id, studentId: req.auth!.sub, ...data },
    update: data,
  });
  res.json({ progress });
});

// --- Tentatives (élève) ---

exercisesRouter.get('/:id/attempts', async (req, res) => {
  const exercise = await prisma.strkExercise.findUnique({ where: { id: req.params.id } });
  if (!exercise) {
    return res.status(404).json({ error: 'Exercice introuvable' });
  }
  if (!canAccessExercise(req.auth!, exercise)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }

  const auth = req.auth!;
  const isOwnerOrStaff =
    isGlobalAdmin(auth) ||
    exercise.teacherId === auth.sub ||
    (auth.role === 'school_admin' && isSameInstitution(auth, exercise.institutionId));

  // Enseignant / direction : sans studentId → toutes les tentatives (résultats).
  // Un élève continue de ne voir que les siennes (chemin ci-dessous).
  if (isOwnerOrStaff && req.query.studentId === undefined) {
    const attempts = await prisma.strkExerciseAttempt.findMany({
      where: { exerciseId: req.params.id },
      orderBy: [{ submittedAt: 'desc' }, { startedAt: 'desc' }],
    });
    const studentIds = [...new Set(attempts.map((a) => a.studentId))];
    const profiles =
      studentIds.length === 0
        ? []
        : await prisma.strkProfile.findMany({
            where: { id: { in: studentIds } },
            select: { id: true, firstName: true, lastName: true, email: true },
          });
    const byId = new Map(profiles.map((p) => [p.id, p]));
    return res.json({
      attempts: attempts.map((a) => ({
        ...a,
        student: byId.get(a.studentId) ?? null,
      })),
    });
  }

  const studentId = await resolveProgressStudentId(req, res, req.query.studentId);
  if (!studentId) return;
  const attempts = await prisma.strkExerciseAttempt.findMany({
    where: { exerciseId: req.params.id, studentId },
    orderBy: { attemptNumber: 'desc' },
  });
  res.json({ attempts });
});

// Le numéro de tentative est calculé côté serveur (le hook d'origine le
// calculait côté client à partir de l'état local, ce qui pouvait dérailler en
// cas de rechargement de page).
exercisesRouter.post('/:id/attempts', async (req, res) => {
  const studentId = req.auth!.sub;
  const exercise = await prisma.strkExercise.findUnique({ where: { id: req.params.id } });
  if (!exercise) {
    return res.status(404).json({ error: 'Exercice introuvable' });
  }
  if (!canAccessExercise(req.auth!, exercise)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const attemptCount = await prisma.strkExerciseAttempt.count({ where: { exerciseId: req.params.id, studentId } });
  if (exercise.maxAttempts && attemptCount >= exercise.maxAttempts) {
    return res.status(403).json({ error: 'Nombre maximum de tentatives atteint' });
  }
  const attempt = await prisma.strkExerciseAttempt.create({
    data: {
      exerciseId: req.params.id,
      studentId,
      attemptNumber: attemptCount + 1,
      status: 'in_progress',
    },
  });
  res.status(201).json({ attempt });
});

const submitAttemptSchema = z.object({
  answers: z.record(z.any()),
  score: z.number(),
});

exercisesRouter.patch('/attempts/:attemptId', async (req, res) => {
  const attempt = await prisma.strkExerciseAttempt.findUnique({ where: { id: req.params.attemptId } });
  if (!attempt) {
    return res.status(404).json({ error: 'Tentative introuvable' });
  }
  if (attempt.studentId !== req.auth!.sub) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const parsed = submitAttemptSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const updated = await prisma.strkExerciseAttempt.update({
    where: { id: req.params.attemptId },
    data: {
      answers: parsed.data.answers,
      score: parsed.data.score,
      status: 'submitted',
      submittedAt: new Date(),
    },
  });
  res.json({ attempt: updated });
});
