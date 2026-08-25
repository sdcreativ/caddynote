import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getCourseInstitutionId, isSameInstitution } from '../lib/authz.js';
import { rejectUnlessCourseTenant, rejectUnlessResolvedTenant, rejectUnlessStudentAccess, sendForbidden } from '../lib/httpAuthz.js';
import { notifyAssignmentPublished, runAssignmentReminderCheck } from '../lib/assignmentReminders.js';
import { buildAssignmentFollowUp } from '../lib/assignmentFollowUp.js';
import { isOwnedObjectKey } from '../lib/s3.js';
import { STORAGE_FOLDER } from '../lib/storageFolders.js';
import { TEACHING_ROLES } from '../lib/authz.js';
import { logAudit } from '../lib/audit.js';

export const assignmentsRouter = Router();
assignmentsRouter.use(requireAuth);

// Déclenchement manuel de la tâche planifiée (PED-005), même principe que
// POST /absences/alert-check — réservé à l'admin global.
assignmentsRouter.post('/reminder-check', requireRole('admin'), async (_req, res) => {
  const result = await runAssignmentReminderCheck();
  res.json(result);
});

// strk_assignments/strk_submissions n'ont pas d'institutionId propre — leur
// tenant se déduit de la chaîne devoir -> cours -> établissement, jamais
// d'une valeur fournie par l'appelant (ORG-004).
const getAssignmentInstitutionId = async (assignmentId: string): Promise<string | null> => {
  const assignment = await prisma.strkAssignment.findUnique({ where: { id: assignmentId }, select: { courseId: true } });
  return assignment ? getCourseInstitutionId(assignment.courseId) : null;
};

const getSubmissionInstitutionId = async (submissionId: string): Promise<string | null> => {
  const submission = await prisma.strkSubmission.findUnique({ where: { id: submissionId }, select: { assignmentId: true } });
  return submission ? getAssignmentInstitutionId(submission.assignmentId) : null;
};

// strk_assignments/strk_submissions n'ont aucune contrainte de clé étrangère
// côté base d'origine (fidèlement reproduit dans schema.prisma) : les
// informations de cours/classe sont donc rattachées manuellement.
const enrichAssignments = async <T extends { courseId: string }>(assignments: T[]) => {
  const courseIds = [...new Set(assignments.map((a) => a.courseId))];
  const courses = await prisma.strkCourse.findMany({
    where: { id: { in: courseIds } },
    select: { id: true, name: true, classId: true, teacher: { select: { profile: { select: { firstName: true, lastName: true } } } } },
  });
  const courseById = new Map(courses.map((c) => [c.id, c]));
  return assignments.map((a) => ({ ...a, course: courseById.get(a.courseId) ?? null }));
};

assignmentsRouter.get('/', async (req, res) => {
  const { teacherId, studentId } = req.query;

  if (typeof teacherId === 'string') {
    // Un enseignant ne consulte que ses propres devoirs ; le personnel de
    // direction, ceux de son établissement (ORG-004).
    if (teacherId !== req.auth!.sub) {
      const teacher = await prisma.strkProfile.findUnique({ where: { id: teacherId }, select: { institutionId: true } });
      if (!teacher) {
        sendForbidden(res);
        return;
      }
      if (rejectUnlessResolvedTenant(res, req.auth!, teacher.institutionId) === null) return;
    }
    const assignments = await prisma.strkAssignment.findMany({ where: { teacherId }, orderBy: { dueDate: 'asc' } });
    return res.json({ assignments: await enrichAssignments(assignments) });
  }

  if (typeof studentId === 'string') {
    const access = await rejectUnlessStudentAccess(res, req.auth!, studentId);
    if (!access) return;
    // Devoirs des cours de la classe actuelle de l'élève (le service d'origine
    // ne filtrait pas du tout par élève — corrigé ici).
    const student = await prisma.strkStudent.findUnique({ where: { id: studentId } });
    const courses = student?.classId
      ? await prisma.strkCourse.findMany({ where: { classId: student.classId }, select: { id: true } })
      : [];
    const courseIds = courses.map((c) => c.id);
    const assignments = await prisma.strkAssignment.findMany({
      where: { courseId: { in: courseIds } },
      orderBy: { dueDate: 'asc' },
    });
    const enriched = await enrichAssignments(assignments);
    const submissions = await prisma.strkSubmission.findMany({
      where: { assignmentId: { in: assignments.map((a) => a.id) }, studentId },
      select: { id: true, assignmentId: true, status: true, submittedAt: true, grade: true, feedback: true },
    });
    const submissionByAssignment = new Map(submissions.map((s) => [s.assignmentId, s]));
    return res.json({
      assignments: enriched.map((a) => ({ ...a, submission: submissionByAssignment.get(a.id) ?? null })),
    });
  }

  return res.status(400).json({ error: 'teacherId ou studentId requis' });
});

assignmentsRouter.get('/:id', async (req, res) => {
  const assignment = await prisma.strkAssignment.findUnique({ where: { id: req.params.id } });
  if (!assignment) {
    return res.status(404).json({ error: 'Devoir introuvable' });
  }
  // ORG-004 : sans ce contrôle, un devoir était consultable par id par
  // n'importe quel compte authentifié, tous établissements confondus.
  const institutionId = await rejectUnlessCourseTenant(res, req.auth!, assignment.courseId);
  if (!institutionId) return;
  res.json({ assignment });
});

const assignmentSchema = z.object({
  courseId: z.string().uuid(),
  teacherId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  instructions: z.string().optional(),
  dueDate: z.string(),
  maxGrade: z.number().default(20),
  assignmentType: z.string().default('homework'),
  status: z.string().default('active'),
  attachments: z.array(z.any()).default([]),
});

// Sans contrôle d'établissement sur le cours cible, n'importe quel
// enseignant pouvait créer un devoir sur un cours d'un autre établissement
// (fuite + intégrité ORG-004).
assignmentsRouter.post('/', requireRole('admin', 'school_admin', 'teacher'), async (req, res) => {
  const parsed = assignmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const institutionId = await rejectUnlessCourseTenant(res, req.auth!, parsed.data.courseId);
  if (!institutionId) return;
  const assignment = await prisma.strkAssignment.create({
    data: { ...parsed.data, dueDate: new Date(parsed.data.dueDate) },
  });
  await logAudit({
    institutionId,
    actorId: req.auth!.sub,
    action: 'assignment.created',
    targetType: 'assignment',
    targetId: assignment.id,
    metadata: { title: assignment.title, courseId: assignment.courseId },
    ipAddress: req.ip,
  });
  // PED-005 : notification "publication" à toute la classe. Jamais attendue
  // avant de répondre — un roster de 30 élèves ne doit pas ralentir la
  // création du devoir pour l'enseignant, et un échec d'envoi ne doit
  // jamais faire échouer la création elle-même.
  notifyAssignmentPublished(assignment.id).catch((error) =>
    console.error(`Échec des notifications de publication du devoir ${assignment.id} :`, error)
  );
  res.status(201).json({ assignment });
});

assignmentsRouter.patch('/:id', requireRole('admin', 'school_admin', 'teacher'), async (req, res) => {
  const institutionId = await getAssignmentInstitutionId(req.params.id);
  if (!institutionId || !isSameInstitution(req.auth!, institutionId)) {
    return res.status(404).json({ error: 'Devoir introuvable' });
  }
  const parsed = assignmentSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  // Empêche de "déplacer" un devoir vers le cours d'un autre établissement.
  if (parsed.data.courseId) {
    const targetInstitutionId = await rejectUnlessCourseTenant(res, req.auth!, parsed.data.courseId);
    if (!targetInstitutionId) return;
  }
  const { dueDate, ...rest } = parsed.data;
  const assignment = await prisma.strkAssignment.update({
    where: { id: req.params.id },
    data: { ...rest, ...(dueDate ? { dueDate: new Date(dueDate) } : {}) },
  });
  res.json({ assignment });
});

assignmentsRouter.delete('/:id', requireRole('admin', 'school_admin', 'teacher'), async (req, res) => {
  const institutionId = await getAssignmentInstitutionId(req.params.id);
  if (!institutionId || !isSameInstitution(req.auth!, institutionId)) {
    return res.status(404).json({ error: 'Devoir introuvable' });
  }
  await prisma.strkAssignment.delete({ where: { id: req.params.id } });
  await logAudit({
    institutionId,
    actorId: req.auth!.sub,
    action: 'assignment.deleted',
    targetType: 'assignment',
    targetId: req.params.id,
    ipAddress: req.ip,
  });
  res.json({ success: true });
});

// --- Soumissions ---

assignmentsRouter.get('/:assignmentId/follow-up', requireRole(...TEACHING_ROLES), async (req, res) => {
  // PED-004 : roster de la classe + statut de chaque élève (rendu, retard,
  // non remis). Distinct de GET .../submissions, qui ne renvoie que les copies
  // déjà créées — un élève absent de cette liste paraissait « à jour ».
  const institutionId = rejectUnlessResolvedTenant(res, req.auth!, await getAssignmentInstitutionId(req.params.assignmentId));
  if (!institutionId) return;
  const followUp = await buildAssignmentFollowUp(req.params.assignmentId);
  if (!followUp) {
    return res.status(404).json({ error: 'Devoir introuvable' });
  }
  res.json(followUp);
});

assignmentsRouter.get('/:assignmentId/submissions', requireRole(...TEACHING_ROLES), async (req, res) => {
  // ORG-004 : sans ce contrôle, le personnel d'un établissement B pouvait
  // lister les soumissions (contenu + noms d'élèves) d'un devoir de
  // l'établissement A en devinant son id.
  const institutionId = rejectUnlessResolvedTenant(res, req.auth!, await getAssignmentInstitutionId(req.params.assignmentId));
  if (!institutionId) return;
  const submissions = await prisma.strkSubmission.findMany({
    where: { assignmentId: req.params.assignmentId },
    orderBy: { submittedAt: 'desc' },
  });
  const studentIds = [...new Set(submissions.map((s) => s.studentId))];
  const students = await prisma.strkStudent.findMany({
    where: { id: { in: studentIds } },
    select: { id: true, profile: { select: { firstName: true, lastName: true } } },
  });
  const studentById = new Map(students.map((s) => [s.id, s]));
  res.json({ submissions: submissions.map((s) => ({ ...s, student: studentById.get(s.studentId) ?? null })) });
});

const SUBMISSION_STATUSES = ['draft', 'submitted', 'late', 'graded', 'returned'] as const;

const submissionSchema = z.object({
  assignmentId: z.string().uuid(),
  studentId: z.string().uuid(),
  content: z.string().optional(),
  attachments: z
    .array(
      z.object({
        name: z.string().min(1),
        size: z.number().optional(),
        type: z.string().optional(),
        key: z.string().min(1),
      })
    )
    .default([]),
  status: z.enum(SUBMISSION_STATUSES).optional(),
});

// PED-004 : un élève ne soumet que pour lui-même ; le personnel, uniquement
// pour un devoir de son propre établissement (ORG-004).
assignmentsRouter.post('/submissions', async (req, res) => {
  const parsed = submissionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const isSelf = req.auth!.sub === parsed.data.studentId;
  if (!isSelf && !['admin', 'school_admin', 'teacher'].includes(req.auth!.role)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const institutionId = rejectUnlessResolvedTenant(res, req.auth!, await getAssignmentInstitutionId(parsed.data.assignmentId));
  if (!institutionId) return;
  for (const att of parsed.data.attachments) {
    if (!isOwnedObjectKey(att.key, STORAGE_FOLDER.devoirs, institutionId, req.auth!.sub)) {
      return res.status(403).json({ error: 'Pièce jointe hors périmètre de stockage' });
    }
  }

  const assignment = await prisma.strkAssignment.findUnique({ where: { id: parsed.data.assignmentId } });
  let status = parsed.data.status ?? 'submitted';
  if (status === 'submitted' && assignment && assignment.dueDate < new Date()) {
    status = 'late';
  }
  if (isSelf && status === 'graded') {
    return res.status(403).json({ error: 'Un élève ne peut pas marquer une soumission comme notée' });
  }

  const submission = await prisma.strkSubmission.upsert({
    where: { assignmentId_studentId: { assignmentId: parsed.data.assignmentId, studentId: parsed.data.studentId } },
    create: {
      assignmentId: parsed.data.assignmentId,
      studentId: parsed.data.studentId,
      content: parsed.data.content,
      attachments: parsed.data.attachments,
      submittedAt: status === 'draft' ? null : new Date(),
      status,
    },
    update: {
      content: parsed.data.content,
      attachments: parsed.data.attachments,
      submittedAt: status === 'draft' ? undefined : new Date(),
      status,
    },
  });
  res.status(201).json({ submission });
});

const updateSubmissionSchema = z.object({
  content: z.string().optional(),
  status: z.enum(['draft', 'submitted', 'late', 'graded', 'returned']).optional(),
  grade: z.number().optional(),
  feedback: z.string().optional(),
});

assignmentsRouter.patch('/submissions/:id', requireRole('admin', 'school_admin', 'teacher'), async (req, res) => {
  const institutionId = await getSubmissionInstitutionId(req.params.id);
  if (!institutionId || !isSameInstitution(req.auth!, institutionId)) {
    return res.status(404).json({ error: 'Soumission introuvable' });
  }
  const parsed = updateSubmissionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const submission = await prisma.strkSubmission.update({ where: { id: req.params.id }, data: parsed.data });
  res.json({ submission });
});

// Sans contrôle d'établissement, n'importe quel enseignant pouvait noter la
// soumission d'un élève d'un autre établissement (fuite + intégrité ORG-004).
assignmentsRouter.patch('/submissions/:id/grade', requireRole('admin', 'school_admin', 'teacher'), async (req, res) => {
  const institutionId = await getSubmissionInstitutionId(req.params.id);
  if (!institutionId || !isSameInstitution(req.auth!, institutionId)) {
    return res.status(404).json({ error: 'Soumission introuvable' });
  }
  const parsed = z.object({ grade: z.number(), feedback: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const submission = await prisma.strkSubmission.update({
    where: { id: req.params.id },
    data: { grade: parsed.data.grade, feedback: parsed.data.feedback, status: 'graded' },
  });
  await logAudit({
    institutionId,
    actorId: req.auth!.sub,
    action: 'assignment.submission_graded',
    targetType: 'submission',
    targetId: submission.id,
    metadata: { assignmentId: submission.assignmentId, studentId: submission.studentId, grade: parsed.data.grade },
    ipAddress: req.ip,
  });
  res.json({ submission });
});
