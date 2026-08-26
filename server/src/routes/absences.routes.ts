import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { isSameInstitution, SUPERVISION_ROLES, DIRECTION_ROLES, getStudentAccess } from '../lib/authz.js';
import { rejectUnlessSameInstitution, rejectUnlessStudentAccess, sendForbidden } from '../lib/httpAuthz.js';
import { notifyGuardiansOfAbsence, runAbsenceAlertCheck } from '../lib/absenceAlertCron.js';
import { runAttendanceThresholdCheck } from '../lib/attendanceThresholds.js';
import { logAudit } from '../lib/audit.js';
import { isOwnedObjectKey } from '../lib/s3.js';
import { STORAGE_FOLDER } from '../lib/storageFolders.js';
import {
  filterUpcomingCalls,
  parseScheduleDayToDayOfWeek,
  type UpcomingCallCandidate,
} from '../lib/attendanceCallReminders.js';
import { normalizeTimeHhMm } from '../lib/courseSchedule.js';

export const absencesRouter = Router();
absencesRouter.use(requireAuth);

/** Enrichit les absences avec prénom/nom élève + libellé cours (pas d’FK join Prisma sur le listage brut). */
const enrichAbsences = async <T extends { studentId: string; courseId: string | null }>(absences: T[]) => {
  if (absences.length === 0) return [];
  const studentIds = [...new Set(absences.map((a) => a.studentId))];
  const courseIds = [...new Set(absences.map((a) => a.courseId).filter((id): id is string => !!id))];

  const [profiles, courses] = await Promise.all([
    prisma.strkProfile.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
    courseIds.length
      ? prisma.strkCourse.findMany({
          where: { id: { in: courseIds } },
          select: { id: true, name: true, class: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);

  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const courseById = new Map(courses.map((c) => [c.id, c]));

  return absences.map((a) => {
    const profile = profileById.get(a.studentId);
    const course = a.courseId ? courseById.get(a.courseId) : undefined;
    return {
      ...a,
      student: profile
        ? {
            firstName: profile.firstName,
            lastName: profile.lastName,
            email: profile.email,
          }
        : null,
      courseName: course?.name ?? null,
      className: course?.class?.name ?? null,
    };
  });
};

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

/**
 * Rappels d’appel pour l’enseignant connecté : créneaux démarrant dans
 * `withinMinutes` (défaut 10), hors appel déjà saisi aujourd’hui pour le cours.
 */
absencesRouter.get('/upcoming-calls', requireRole('teacher', 'head_teacher'), async (req, res) => {
  const withinRaw = typeof req.query.withinMinutes === 'string' ? Number(req.query.withinMinutes) : 10;
  const withinMinutes = Number.isFinite(withinRaw) ? Math.min(60, Math.max(1, Math.floor(withinRaw))) : 10;
  const teacherId = req.auth!.sub;
  const institutionId = req.auth!.institutionId;
  if (!institutionId) {
    return res.status(400).json({ error: 'Aucun établissement associé à ce compte' });
  }

  const now = new Date();
  const dayOfWeek = now.getDay();
  const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const [schedules, courses] = await Promise.all([
    prisma.strkSchedule.findMany({
      where: {
        institutionId,
        isActive: true,
        dayOfWeek,
        OR: [{ teacherId }, { course: { teacherId } }],
      },
      include: {
        course: { select: { id: true, name: true } },
        class: { select: { id: true, name: true } },
      },
      take: 100,
    }),
    prisma.strkCourse.findMany({
      where: {
        institutionId,
        teacherId,
        scheduleDay: { not: null },
        scheduleTime: { not: null },
      },
      select: {
        id: true,
        name: true,
        classId: true,
        scheduleDay: true,
        scheduleTime: true,
        class: { select: { name: true } },
      },
      take: 100,
    }),
  ]);

  const candidates: Array<UpcomingCallCandidate & { dayOfWeek: number }> = [];
  const seenCourseIds = new Set<string>();

  for (const s of schedules) {
    if (seenCourseIds.has(s.courseId)) continue;
    seenCourseIds.add(s.courseId);
    candidates.push({
      courseId: s.courseId,
      classId: s.classId ?? s.class?.id ?? null,
      courseName: s.course.name,
      className: s.class?.name ?? null,
      startTime: s.startTime,
      scheduleId: s.id,
      dayOfWeek: s.dayOfWeek,
    });
  }

  for (const c of courses) {
    if (seenCourseIds.has(c.id)) continue;
    const dow = c.scheduleDay ? parseScheduleDayToDayOfWeek(c.scheduleDay) : null;
    const start = c.scheduleTime ? normalizeTimeHhMm(c.scheduleTime) : null;
    if (dow == null || !start || dow !== dayOfWeek) continue;
    seenCourseIds.add(c.id);
    candidates.push({
      courseId: c.id,
      classId: c.classId,
      courseName: c.name,
      className: c.class?.name ?? null,
      startTime: start,
      scheduleId: null,
      dayOfWeek: dow,
    });
  }

  const courseIds = candidates.map((c) => c.courseId);
  const taken =
    courseIds.length === 0
      ? []
      : await prisma.strkAbsence.findMany({
          where: {
            institutionId,
            date: { equals: new Date(ymd) },
            courseId: { in: courseIds },
          },
          select: { courseId: true },
        });
  const alreadyTaken = new Set(
    taken.map((t) => t.courseId).filter((id): id is string => typeof id === 'string' && id.length > 0)
  );

  const calls = filterUpcomingCalls(candidates, now, withinMinutes, alreadyTaken);
  res.json({ calls, withinMinutes, serverTime: now.toISOString() });
});

absencesRouter.get('/', async (req, res) => {
  const { studentId, institutionId, courseId, classId, date, startDate, endDate } = req.query;

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
    return res.json({ absences: await enrichAbsences(absences) });
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
    return res.json({ absences: await enrichAbsences(absences) });
  }

  // Historique d’appel par classe (effectif actif) — utilisé par le hub Présences.
  if (typeof classId === 'string') {
    const cls = await prisma.strkClass.findUnique({
      where: { id: classId },
      select: { institutionId: true },
    });
    if (!cls) {
      sendForbidden(res);
      return;
    }
    if (rejectUnlessSameInstitution(res, req.auth!, cls.institutionId)) return;
    const enrollments = await prisma.strkClassStudent.findMany({
      where: { classId, isActive: true },
      select: { studentId: true },
    });
    // Aligné sur le roster classes : inscriptions actives + éventuel classId legacy.
    const legacyStudents = await prisma.strkStudent.findMany({
      where: { classId },
      select: { id: true },
    });
    const studentIds = [
      ...new Set([...enrollments.map((e) => e.studentId), ...legacyStudents.map((s) => s.id)]),
    ];
    if (studentIds.length === 0) {
      return res.json({ absences: [] });
    }
    const absences = await prisma.strkAbsence.findMany({
      where: {
        institutionId: cls.institutionId,
        studentId: { in: studentIds },
        ...(dateFilter ? { date: dateFilter } : {}),
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
    return res.json({ absences: await enrichAbsences(absences) });
  }

  if (typeof institutionId === 'string') {
    if (rejectUnlessSameInstitution(res, req.auth!, institutionId)) return;
    const absences = await prisma.strkAbsence.findMany({ where: { institutionId }, orderBy: { date: 'desc' } });
    return res.json({ absences: await enrichAbsences(absences) });
  }

  return res.status(400).json({ error: 'studentId, courseId, classId ou institutionId requis' });
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

/** Alerte parentale dès la saisie (absence ou retard). Anti-doublon via `alertSentAt`. */
const fireAbsenceParentAlert = async (absence: {
  id: string;
  studentId: string;
  courseId: string | null;
  date: Date;
  type: string;
  justified: boolean;
  alertSentAt: Date | null;
  createdBy: string | null;
}): Promise<void> => {
  try {
    await notifyGuardiansOfAbsence(absence, { immediate: true });
  } catch (err) {
    console.error('Alerte parentale présence (immédiat) :', err);
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
  await fireAbsenceParentAlert(absence);
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
    const absence = await createIdempotentAbsence(item, req.auth!.sub);
    await fireAbsenceParentAlert(absence);
    created.push(absence);
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
  // DOC-005 / ORG-004 : la pièce jointe doit être une clé du dossier
  // `justificatifs/` appartenant au tenant de l’appelant (jamais une URL libre).
  if (parsed.data.justificationFile) {
    const key = parsed.data.justificationFile;
    if (
      !key.startsWith(`${STORAGE_FOLDER.justificatifs}/`) ||
      !isOwnedObjectKey(key, STORAGE_FOLDER.justificatifs, req.auth!.institutionId, req.auth!.sub)
    ) {
      return res.status(400).json({ error: 'Fichier justificatif invalide' });
    }
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
