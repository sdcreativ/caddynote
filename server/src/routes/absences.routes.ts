import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { isSameInstitution, SUPERVISION_ROLES, DIRECTION_ROLES, getStudentAccess } from '../lib/authz.js';
import { rejectUnlessSameInstitution, rejectUnlessStudentAccess, sendForbidden } from '../lib/httpAuthz.js';
import { runAbsenceAlertCheck } from '../lib/absenceAlertCron.js';
import { runAttendanceThresholdCheck } from '../lib/attendanceThresholds.js';
import { logAudit } from '../lib/audit.js';

export const absencesRouter = Router();
absencesRouter.use(requireAuth);

// Déclenchement manuel de la tâche planifiée horaire (PRS-004), utile pour
// tester sans attendre — même principe que POST /subscriptions/expiration-check.
// Réservé à l'admin global : ce n'est pas une action métier d'établissement.
absencesRouter.post('/alert-check', requireRole('admin'), async (_req, res) => {
  const result = await runAbsenceAlertCheck();
  res.json(result);
});

// Même principe pour PRS-006 (seuils d'assiduité).
absencesRouter.post('/threshold-check', requireRole('admin'), async (_req, res) => {
  const result = await runAttendanceThresholdCheck();
  res.json(result);
});

// PRS-006 : historique des seuils franchis — utile au personnel pour le
// suivi individuel (dossier élève) sans attendre une nouvelle notification.
absencesRouter.get('/threshold-alerts', requireRole(...DIRECTION_ROLES, 'supervisor'), async (req, res) => {
  const { institutionId, studentId } = req.query;
  if (typeof institutionId !== 'string') {
    sendForbidden(res);
    return;
  }
  if (rejectUnlessSameInstitution(res, req.auth!, institutionId)) return;
  const alerts = await prisma.strkThresholdAlert.findMany({
    where: { institutionId, studentId: typeof studentId === 'string' ? studentId : undefined },
    orderBy: { triggeredAt: 'desc' },
    take: 200,
  });
  res.json({ alerts });
});

absencesRouter.get('/', async (req, res) => {
  const { studentId, institutionId, courseId, date, startDate, endDate } = req.query;

  const dateFilter =
    typeof date === 'string'
      ? { equals: new Date(date) }
      : startDate || endDate
        ? {
            ...(typeof startDate === 'string' ? { gte: new Date(startDate) } : {}),
            ...(typeof endDate === 'string' ? { lte: new Date(endDate) } : {}),
          }
        : undefined;

  if (typeof studentId === 'string') {
    const access = await rejectUnlessStudentAccess(res, req.auth!, studentId, { guardianPermission: 'canViewAttendance' });
    if (!access) return;
    const absences = await prisma.strkAbsence.findMany({
      where: { studentId, ...(dateFilter ? { date: dateFilter } : {}) },
      orderBy: { date: 'desc' },
    });
    return res.json({ absences });
  }

  if (typeof courseId === 'string') {
    // ORG-004 : un courseId seul ne suffisait pas à prouver l'appartenance à
    // l'établissement de l'appelant — n'importe quel compte pouvait lister
    // les absences d'un cours d'un autre établissement en devinant son id.
    const course = await prisma.strkCourse.findUnique({ where: { id: courseId }, select: { institutionId: true } });
    if (!course) {
      sendForbidden(res);
      return;
    }
    if (rejectUnlessSameInstitution(res, req.auth!, course.institutionId)) return;
    const absences = await prisma.strkAbsence.findMany({
      where: { courseId, ...(dateFilter ? { date: dateFilter } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ absences });
  }

  if (typeof institutionId === 'string') {
    if (rejectUnlessSameInstitution(res, req.auth!, institutionId)) return;
    const absences = await prisma.strkAbsence.findMany({ where: { institutionId }, orderBy: { date: 'desc' } });
    return res.json({ absences });
  }

  return res.status(400).json({ error: 'studentId, courseId ou institutionId requis' });
});

const absenceSchema = z.object({
  studentId: z.string().uuid(),
  institutionId: z.string().uuid(),
  courseId: z.string().uuid().optional(),
  type: z.enum(['absence', 'lateness']),
  date: z.string(),
  duration: z.number().int(),
  // PRS-003 : identifiant généré côté client (mode hors ligne) — une
  // resynchronisation portant le même clientId ne crée jamais de doublon,
  // elle renvoie l'enregistrement déjà créé lors de la tentative précédente.
  clientId: z.string().min(1).max(100).optional(),
});

/** Crée l'absence, ou renvoie l'existante si `clientId` a déjà été traité —
 * la garantie d'unicité vient de la contrainte DB (`clientId` unique),
 * jamais d'un simple "vérifier puis créer" qui resterait sujet à une course
 * entre deux tentatives de resynchronisation concurrentes. */
const createIdempotentAbsence = async (item: z.infer<typeof absenceSchema>, createdBy: string) => {
  try {
    return await prisma.strkAbsence.create({
      data: { ...item, date: new Date(item.date), justified: false, createdBy },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && item.clientId) {
      const existing = await prisma.strkAbsence.findUnique({ where: { clientId: item.clientId } });
      if (existing) return existing;
    }
    throw error;
  }
};

// PRS-001/002 : appel réservé au personnel enseignant/direction.
absencesRouter.post('/', requireRole(...SUPERVISION_ROLES), async (req, res) => {
  const parsed = absenceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  if (rejectUnlessSameInstitution(res, req.auth!, parsed.data.institutionId)) return;
  const absence = await createIdempotentAbsence(parsed.data, req.auth!.sub);
  res.status(201).json({ absence });
});

// PRS-003 : synchronisation de plusieurs saisies d'appel en une fois (mode
// hors ligne) — chaque élément est traité indépendamment (pas de transaction
// unique) pour qu'une resynchronisation partielle ne bloque jamais les
// éléments déjà valides à cause d'un seul élément en échec.
absencesRouter.post('/bulk', requireRole(...SUPERVISION_ROLES), async (req, res) => {
  const parsed = z.array(absenceSchema).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  for (const item of parsed.data) {
    if (rejectUnlessSameInstitution(res, req.auth!, item.institutionId)) return;
  }
  const created = [];
  for (const item of parsed.data) {
    created.push(await createIdempotentAbsence(item, req.auth!.sub));
  }
  res.status(201).json({ absences: created });
});

absencesRouter.get('/stats', async (req, res) => {
  const { studentId, startDate, endDate } = req.query;
  if (typeof studentId !== 'string' || typeof startDate !== 'string' || typeof endDate !== 'string') {
    return res.status(400).json({ error: 'studentId, startDate et endDate requis' });
  }
  const access = await getStudentAccess(req.auth!, studentId);
  if (!access.allowed || (access.via === 'guardian' && !access.permissions.canViewAttendance)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }

  const records = await prisma.strkAbsence.findMany({
    where: { studentId, date: { gte: new Date(startDate), lte: new Date(endDate) } },
    select: { type: true, justified: true },
  });

  const totalSessions = records.length;
  const absentCount = records.filter((r) => r.type === 'absence').length;
  const lateCount = records.filter((r) => r.type === 'lateness').length;
  const excusedCount = records.filter((r) => r.justified).length;
  // Estimation approximative, cf. service d'origine — pas de calendrier de séances réel.
  const totalDays = 20;
  const presentCount = Math.max(0, totalDays - absentCount);
  const attendanceRate = totalDays > 0 ? ((presentCount + lateCount) / totalDays) * 100 : 0;

  res.json({
    stats: {
      total_sessions: totalSessions,
      present_count: presentCount,
      absent_count: absentCount,
      late_count: lateCount,
      excused_count: excusedCount,
      attendance_rate: attendanceRate,
    },
  });
});

const justifySchema = z.object({
  justification: z.string().min(1),
  justificationFile: z.string().optional(),
});

/**
 * Dépôt de justificatif (PRS-005). Autorisé pour : le personnel de
 * l'établissement, l'élève lui-même, ou un parent avec le droit
 * can_view_attendance sur un lien actif (ELV-002) — remplace la policy RLS
 * "Guardians can submit justification for linked children".
 */
absencesRouter.patch('/:id/justify', async (req, res) => {
  const absence = await prisma.strkAbsence.findUnique({ where: { id: req.params.id } });
  if (!absence) {
    return res.status(404).json({ error: 'Absence introuvable' });
  }
  const access = await getStudentAccess(req.auth!, absence.studentId);
  if (!access.allowed || (access.via === 'guardian' && !access.permissions.canViewAttendance)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const parsed = justifySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const updated = await prisma.strkAbsence.update({
    where: { id: req.params.id },
    data: {
      justification: parsed.data.justification,
      justificationFile: parsed.data.justificationFile,
      // Un nouveau dépôt (y compris après un rejet) repasse en attente de
      // décision — jamais auto-accepté, même si un dépôt précédent l'avait
      // déjà été (on ne réutilise pas une ancienne décision pour un nouveau
      // justificatif).
      justificationStatus: 'pending',
      justificationReviewedAt: null,
      justificationReviewedBy: null,
    },
  });
  res.json({ absence: updated });
});

// Acceptation/refus du justificatif : réservé au personnel (workflow de validation).
absencesRouter.patch('/:id/review', requireRole(...SUPERVISION_ROLES), async (req, res) => {
  const existing = await prisma.strkAbsence.findUnique({ where: { id: req.params.id }, select: { institutionId: true } });
  // ORG-004 : sans cette vérification, le personnel d'un établissement B
  // pouvait valider/rejeter le justificatif d'une absence de l'établissement A.
  if (!existing || !isSameInstitution(req.auth!, existing.institutionId)) {
    return res.status(404).json({ error: 'Absence introuvable' });
  }
  const parsed = z.object({ justified: z.boolean() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const absence = await prisma.strkAbsence.update({
    where: { id: req.params.id },
    data: {
      justified: parsed.data.justified,
      // PRS-005 : décision explicite du personnel, distincte d'un simple
      // `justified=false` par défaut jamais examiné (StrkJustificationStatus).
      justificationStatus: parsed.data.justified ? 'accepted' : 'rejected',
      justificationReviewedAt: new Date(),
      justificationReviewedBy: req.auth!.sub,
    },
  });
  await logAudit({
    institutionId: existing.institutionId,
    actorId: req.auth!.sub,
    action: parsed.data.justified ? 'absence.justification_accepted' : 'absence.justification_rejected',
    targetType: 'absence',
    targetId: absence.id,
    ipAddress: req.ip,
  });
  res.json({ absence });
});
