import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireFeature } from '../middleware/requireFeature.js';
import { EXPORT_ROLES, isGlobalAdmin, isSameInstitution } from '../lib/authz.js';
import { toCsv } from '../lib/csvExport.js';
import { invalidateDashboardSummaryCache } from '../lib/dashboardCache.js';

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);

// ORG-004 : tout le module renvoie des agrégats (effectifs, absences,
// signatures...) par établissement — sans ce contrôle, un institutionId
// arbitraire suffisait à sonder l'activité d'un autre établissement. Sans
// institutionId explicite, seul l'admin global obtient la vue tous
// établissements confondus ; le personnel d'établissement est ramené à son
// propre périmètre.
const resolveScopedInstitutionId = (req: import('express').Request, res: import('express').Response): string | undefined | false => {
  const institutionId = typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined;
  if (institutionId) {
    if (!isSameInstitution(req.auth!, institutionId)) {
      res.status(403).json({ error: 'Permissions insuffisantes' });
      return false;
    }
    return institutionId;
  }
  if (isGlobalAdmin(req.auth!)) return undefined;
  return req.auth!.institutionId ?? '__none__';
};

async function calculateDashboardMetrics(institutionId?: string) {
  const [totalInstitutions, profiles, absencesToday, recentActivities] = await Promise.all([
    institutionId ? Promise.resolve(1) : prisma.strkInstitution.count(),
    prisma.strkProfile.findMany({
      where: institutionId ? { institutionId } : {},
      select: { role: true },
    }),
    prisma.strkAbsence.count({
      where: {
        date: new Date(new Date().toISOString().split('T')[0]),
        ...(institutionId ? { institutionId } : {}),
      },
    }),
    prisma.strkActivity.findMany({
      where: institutionId ? { institutionId } : {},
      include: { institution: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  const roleCounts = profiles.reduce<Record<string, number>>((acc, p) => {
    acc[p.role] = (acc[p.role] || 0) + 1;
    return acc;
  }, {});

  // RPT-003 : bug réel trouvé en travaillant sur la fraîcheur affichée —
  // `estimatedStudents` était une constante fixe (50), pas le nombre réel
  // d'élèves de l'établissement (déjà disponible juste au-dessus via
  // `roleCounts.student`). Le taux d'assiduité affiché était donc correct
  // par pur hasard pour un établissement de 50 élèves, faux pour tous les
  // autres. `null` (pas 0 ni 95 par défaut) quand il n'y a aucun élève :
  // "0% d'assiduité" ou "95% par défaut" seraient tout aussi faux qu'une
  // valeur inventée.
  const totalStudents = roleCounts.student || 0;
  const attendanceRate =
    totalStudents > 0 ? Math.round((((totalStudents - absencesToday) / totalStudents) * 100) * 10) / 10 : null;

  return {
    totalInstitutions,
    totalUsers: profiles.length,
    students: roleCounts.student || 0,
    teachers: roleCounts.teacher || 0,
    totalSchoolAdmins: roleCounts.school_admin || 0,
    attendanceRate,
    absences: absencesToday,
    recentActivities,
  };
};

// RPT-003 : ces métriques sont mises en cache jusqu'à une heure
// (`StrkDashboardStat.validUntil`) — sans indication explicite de fraîcheur,
// rien ne distingue pour l'appelant un calcul à l'instant d'un calcul vieux
// de 59 minutes. `generatedAt` porte toujours l'horodatage réel du calcul
// affiché (celui du cache s'il est servi tel quel, sinon celui du calcul
// qui vient d'avoir lieu) — jamais l'heure de la requête elle-même.
// RPT-004 : ces agrégats (effectifs par rôle, flux d'activité récent...)
// n'étaient réservés à aucun rôle particulier — un élève ou un parent
// authentifié pouvait les interroger comme n'importe quel membre du
// personnel. Ce sont des tableaux de bord internes, pas une donnée à
// exposer à la famille.
analyticsRouter.get('/dashboard-metrics', requireRole(...EXPORT_ROLES), async (req, res) => {
  const institutionId = resolveScopedInstitutionId(req, res);
  if (institutionId === false) return;

  const cached = await prisma.strkDashboardStat.findFirst({
    where: { statType: 'dashboard_summary', period: 'daily', institutionId: institutionId ?? null },
    orderBy: { calculatedAt: 'desc' },
  });
  if (cached && cached.validUntil && new Date(cached.validUntil) > new Date()) {
    return res.json({ metrics: cached.data, generatedAt: cached.calculatedAt });
  }

  const generatedAt = new Date();
  const metrics = await calculateDashboardMetrics(institutionId);
  // Remplace l’ancien cache du même périmètre (évite des lignes périmées
  // qui resteraient servies via findFirst non ordonné).
  await invalidateDashboardSummaryCache(institutionId ?? null);
  await prisma.strkDashboardStat.create({
    data: {
      institutionId,
      statType: 'dashboard_summary',
      period: 'daily',
      data: metrics as any,
      calculatedAt: generatedAt,
      validUntil: new Date(generatedAt.getTime() + 60 * 60 * 1000),
    },
  });
  res.json({ metrics, generatedAt });
});

const recordMetricSchema = z.object({
  metricName: z.string(),
  value: z.number(),
  institutionId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

analyticsRouter.post('/metrics', async (req, res) => {
  const parsed = recordMetricSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  if (parsed.data.institutionId && !isSameInstitution(req.auth!, parsed.data.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  await prisma.strkAnalytic.create({
    data: {
      metricName: parsed.data.metricName,
      metricType: 'counter',
      institutionId: parsed.data.institutionId,
      userId: parsed.data.userId,
      value: parsed.data.value,
      metadata: (parsed.data.metadata ?? {}) as any,
    },
  });
  res.status(201).json({ success: true });
});

const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
const MONTH_NAMES = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

analyticsRouter.get('/weekly-stats', requireRole(...EXPORT_ROLES), async (req, res) => {
  const institutionId = resolveScopedInstitutionId(req, res);
  if (institutionId === false) return;

  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7)); // Lundi
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 6);

  const [absences, signatures] = await Promise.all([
    prisma.strkAbsence.findMany({
      where: { date: { gte: startOfWeek, lte: endOfWeek }, ...(institutionId ? { institutionId } : {}) },
      select: { date: true, type: true },
    }),
    prisma.strkSignature.findMany({
      where: { createdAt: { gte: startOfWeek, lte: endOfWeek }, ...(institutionId ? { institutionId } : {}) },
      select: { createdAt: true },
    }),
  ]);

  // RPT-003 : bug réel trouvé au passage — "retards" était fabriqué comme
  // 30% du nombre d'absences (`Math.floor(absenceCount * 0.3)`), jamais une
  // vraie requête sur `StrkAbsence.type`, alors que la distinction
  // absence/retard existe déjà dans le modèle (utilisée ailleurs, ex.
  // reports.routes.ts). Compté séparément pour de vrai ci-dessous.
  const absencesByDay = countByDateKey(absences.filter((a) => a.type === 'absence').map((a) => a.date));
  const latenessByDay = countByDateKey(absences.filter((a) => a.type === 'lateness').map((a) => a.date));
  const signaturesByDay = countByDateKey(signatures.map((s) => s.createdAt!));

  const stats = DAY_NAMES.map((day, index) => {
    const dayDate = new Date(startOfWeek);
    dayDate.setDate(dayDate.getDate() + index);
    const key = dayDate.toISOString().split('T')[0];
    return {
      day,
      absences: absencesByDay[key] || 0,
      retards: latenessByDay[key] || 0,
      signatures: signaturesByDay[key] || 0,
    };
  });
  // RPT-003 : jamais mis en cache, toujours calculé à la demande — la
  // fraîcheur est donc systématiquement "maintenant", explicitée quand même
  // pour une réponse cohérente avec /dashboard-metrics côté client.
  res.json({ stats, generatedAt: new Date() });
});

analyticsRouter.get('/monthly-stats', requireRole(...EXPORT_ROLES), requireFeature('advancedReports'), async (req, res) => {
  const institutionId = resolveScopedInstitutionId(req, res);
  if (institutionId === false) return;
  const year = new Date().getFullYear();
  const start = new Date(`${year}-01-01`);
  const end = new Date(`${year + 1}-01-01`);

  const [profiles, absences, signatures] = await Promise.all([
    prisma.strkProfile.findMany({
      where: { createdAt: { gte: start, lt: end }, ...(institutionId ? { institutionId } : {}) },
      select: { createdAt: true },
    }),
    prisma.strkAbsence.findMany({
      where: { createdAt: { gte: start, lt: end }, ...(institutionId ? { institutionId } : {}) },
      select: { createdAt: true },
    }),
    prisma.strkSignature.findMany({
      where: { createdAt: { gte: start, lt: end }, ...(institutionId ? { institutionId } : {}) },
      select: { createdAt: true },
    }),
  ]);

  const countByMonth = (dates: (Date | null)[]) => {
    const monthly = new Array(12).fill(0);
    for (const d of dates) if (d) monthly[d.getMonth()]++;
    return monthly;
  };

  const inscriptions = countByMonth(profiles.map((p) => p.createdAt));
  const absenceCounts = countByMonth(absences.map((a) => a.createdAt));
  const signatureCounts = countByMonth(signatures.map((s) => s.createdAt));

  const stats = MONTH_NAMES.map((name, i) => ({
    name,
    inscriptions: inscriptions[i],
    absences: absenceCounts[i],
    signatures: signatureCounts[i],
  }));
  res.json({ stats, generatedAt: new Date() });
});

function countByDateKey(dates: Date[]): Record<string, number> {
  return dates.reduce<Record<string, number>>((acc, d) => {
    const key = new Date(d).toISOString().split('T')[0];
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

/**
 * RPT-003 : découvert en travaillant sur la fraîcheur des données — le
 * "Centre d'Analytics" (`/super-admin`, section Analytics, `AnalyticsCenter`
 * + `AdvancedAnalyticsDashboard`) était **entièrement fabriqué** côté
 * frontend (`useAdvancedAnalytics.tsx` générait des nombres constants —
 * "1250 utilisateurs", "145ms de temps de réponse", "99.9% d'uptime" —
 * présentés sans aucune indication qu'il s'agissait de données de
 * démonstration). Cet endpoint fournit les métriques qui ont une source de
 * donnée réelle dans le produit ; celles qui n'en ont aucune (comportement
 * utilisateur, supervision infra, scores de satisfaction) restent
 * explicitement hors périmètre — voir le commentaire dans
 * `useAdvancedAnalytics.tsx` pour le détail de ce qui reste fabriqué et
 * pourquoi.
 */
analyticsRouter.get('/academic-metrics', requireRole(...EXPORT_ROLES), requireFeature('advancedReports'), async (req, res) => {
  const institutionId = resolveScopedInstitutionId(req, res);
  if (institutionId === false) return;

  const daysRaw = Number(req.query.days);
  const days = [7, 30, 90, 365].includes(daysRaw) ? daysRaw : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const courses = await prisma.strkCourse.findMany({
    where: institutionId ? { institutionId } : {},
    select: { id: true, classId: true },
  });
  const courseIds = courses.map((c) => c.id);

  const [gradeAgg, assignments, messagesExchanged, documentsShared, newUsersThisMonth] = await Promise.all([
    prisma.strkGrade.aggregate({
      where: { courseId: { in: courseIds }, status: 'published' },
      _avg: { gradeValue: true },
    }),
    prisma.strkAssignment.findMany({ where: { courseId: { in: courseIds } }, select: { id: true, courseId: true } }),
    (async () => {
      const profileIds = institutionId
        ? (await prisma.strkProfile.findMany({ where: { institutionId }, select: { id: true } })).map((p) => p.id)
        : undefined;
      return prisma.strkMessage.count({
        where: { createdAt: { gte: since }, ...(profileIds ? { senderId: { in: profileIds } } : {}) },
      });
    })(),
    prisma.strkDocument.count({
      where: {
        generatedAt: { gte: since },
        ...(institutionId ? { institutionId } : {}),
      },
    }),
    prisma.strkProfile.count({
      where: {
        createdAt: { gte: since },
        ...(institutionId ? { institutionId } : {}),
      },
    }),
  ]);

  // Taux de devoirs rendus : nombre réel de soumissions rapporté au nombre
  // réel d'élèves attendus (effectif de la classe du cours concerné), pas
  // une approximation par devoir — un devoir dans une classe de 30 élèves
  // avec 30 soumissions compte pour 100%, pas "1 devoir sur 1".
  const classIdByCourse = new Map(courses.map((c) => [c.id, c.classId]));
  const classIds = [...new Set(courses.map((c) => c.classId).filter((id): id is string => !!id))];
  const studentCounts =
    classIds.length > 0
      ? await prisma.strkStudent.groupBy({ by: ['classId'], where: { classId: { in: classIds } }, _count: { id: true } })
      : [];
  const countByClass = new Map(studentCounts.map((s) => [s.classId, s._count.id]));
  const expectedSubmissions = assignments.reduce(
    (sum, a) => sum + (countByClass.get(classIdByCourse.get(a.courseId) ?? null) || 0),
    0
  );
  const assignmentIds = assignments.map((a) => a.id);
  const actualSubmissions =
    assignmentIds.length > 0
      ? await prisma.strkSubmission.count({ where: { assignmentId: { in: assignmentIds }, submittedAt: { not: null } } })
      : 0;
  const assignmentCompletionRate = expectedSubmissions > 0 ? actualSubmissions / expectedSubmissions : null;

  res.json({
    metrics: {
      averageGrade: gradeAgg._avg.gradeValue ? Math.round(Number(gradeAgg._avg.gradeValue) * 10) / 10 : null,
      assignmentCompletionRate,
      messagesExchanged,
      documentsShared,
      newUsersThisMonth,
      periodDays: days,
    },
    generatedAt: new Date(),
  });
});

/**
 * RPT-003 : classement inter-établissements, réel (taux d'assiduité réel —
 * même calcul corrigé que `calculateDashboardMetrics` ci-dessus — et effectif
 * réel), remplace le "Classement Performance" fabriqué de
 * `useAdvancedAnalytics.tsx`. Réservé à l'admin global : comparer des
 * établissements entre eux n'a de sens que depuis la vue tous établissements
 * confondus (même principe que RPT-001 pour les filtres de comparaison).
 */
analyticsRouter.get('/institution-ranking', requireRole('admin'), requireFeature('advancedReports'), async (req, res) => {
  const institutions = await prisma.strkInstitution.findMany({ select: { id: true, name: true, type: true } });
  const profileCounts = await prisma.strkProfile.groupBy({
    by: ['institutionId', 'role'],
    where: { institutionId: { not: null } },
    _count: { id: true },
  });
  const today = new Date(new Date().toISOString().split('T')[0]);
  const absenceCounts = await prisma.strkAbsence.groupBy({
    by: ['institutionId'],
    where: { date: today },
    _count: { id: true },
  });
  const absenceByInst = new Map(absenceCounts.map((a) => [a.institutionId, a._count.id]));

  const usersByInst = new Map<string, number>();
  const studentsByInst = new Map<string, number>();
  for (const row of profileCounts) {
    if (!row.institutionId) continue;
    usersByInst.set(row.institutionId, (usersByInst.get(row.institutionId) || 0) + row._count.id);
    if (row.role === 'student') {
      studentsByInst.set(row.institutionId, (studentsByInst.get(row.institutionId) || 0) + row._count.id);
    }
  }

  const ranking = institutions
    .map((inst) => {
      const totalStudents = studentsByInst.get(inst.id) || 0;
      const absencesToday = absenceByInst.get(inst.id) || 0;
      const attendanceRate =
        totalStudents > 0 ? Math.round(((totalStudents - absencesToday) / totalStudents) * 1000) / 10 : null;
      return {
        institutionId: inst.id,
        name: inst.name,
        type: inst.type,
        totalUsers: usersByInst.get(inst.id) || 0,
        attendanceRate,
      };
    })
    .sort((a, b) => (b.attendanceRate ?? -1) - (a.attendanceRate ?? -1));

  res.json({ ranking, generatedAt: new Date() });
});

/**
 * §5.15 P2 — export analytics généré côté serveur (JSON ou CSV),
 * remplace le blob JSON assemblé uniquement dans le navigateur
 * (`useAdvancedAnalytics.exportAnalyticsReport`).
 */
analyticsRouter.get('/export', requireRole(...EXPORT_ROLES), requireFeature('advancedReports'), async (req, res) => {
  const institutionId = resolveScopedInstitutionId(req, res);
  if (institutionId === false) return;

  const format = req.query.format === 'csv' ? 'csv' : 'json';
  const daysRaw = Number(req.query.days);
  const days = [7, 30, 90, 365].includes(daysRaw) ? daysRaw : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const dashboard = await calculateDashboardMetrics(institutionId === '__none__' ? undefined : institutionId);

  const courses = await prisma.strkCourse.findMany({
    where: institutionId && institutionId !== '__none__' ? { institutionId } : {},
    select: { id: true, classId: true },
  });
  const courseIds = courses.map((c) => c.id);
  const gradeAgg = await prisma.strkGrade.aggregate({
    where: { courseId: { in: courseIds }, status: 'published' },
    _avg: { gradeValue: true },
  });
  const assignments = await prisma.strkAssignment.findMany({
    where: { courseId: { in: courseIds } },
    select: { id: true, courseId: true },
  });
  const classIdByCourse = new Map(courses.map((c) => [c.id, c.classId]));
  const classIds = [...new Set(courses.map((c) => c.classId).filter((id): id is string => !!id))];
  const studentCounts =
    classIds.length > 0
      ? await prisma.strkStudent.groupBy({ by: ['classId'], where: { classId: { in: classIds } }, _count: { id: true } })
      : [];
  const countByClass = new Map(studentCounts.map((s) => [s.classId, s._count.id]));
  const expectedSubmissions = assignments.reduce(
    (sum, a) => sum + (countByClass.get(classIdByCourse.get(a.courseId) ?? null) || 0),
    0
  );
  const assignmentIds = assignments.map((a) => a.id);
  const actualSubmissions =
    assignmentIds.length > 0
      ? await prisma.strkSubmission.count({ where: { assignmentId: { in: assignmentIds }, submittedAt: { not: null } } })
      : 0;
  const assignmentCompletionRate = expectedSubmissions > 0 ? actualSubmissions / expectedSubmissions : null;

  const profileIds =
    institutionId && institutionId !== '__none__'
      ? (await prisma.strkProfile.findMany({ where: { institutionId }, select: { id: true } })).map((p) => p.id)
      : undefined;
  const [messagesExchanged, documentsShared, newUsersThisMonth] = await Promise.all([
    prisma.strkMessage.count({
      where: { createdAt: { gte: since }, ...(profileIds ? { senderId: { in: profileIds } } : {}) },
    }),
    prisma.strkDocument.count({
      where: {
        generatedAt: { gte: since },
        ...(institutionId && institutionId !== '__none__' ? { institutionId } : {}),
      },
    }),
    prisma.strkProfile.count({
      where: {
        createdAt: { gte: since },
        ...(institutionId && institutionId !== '__none__' ? { institutionId } : {}),
      },
    }),
  ]);

  const academic = {
    averageGrade: gradeAgg._avg.gradeValue ? Math.round(Number(gradeAgg._avg.gradeValue) * 10) / 10 : null,
    assignmentCompletionRate,
    messagesExchanged,
    documentsShared,
    newUsersThisMonth,
    periodDays: days,
  };

  let ranking: unknown[] | undefined;
  if (isGlobalAdmin(req.auth!) && !institutionId) {
    const rankRes = await prisma.strkInstitution.findMany({ select: { id: true, name: true } });
    ranking = rankRes.map((r) => ({ institutionId: r.id, name: r.name }));
  }

  const generatedAt = new Date().toISOString();
  const payload = {
    generatedAt,
    institutionId: institutionId && institutionId !== '__none__' ? institutionId : null,
    periodDays: days,
    dashboard,
    academic,
    ...(ranking ? { rankingPreview: ranking } : {}),
  };

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="analytics-report-${generatedAt.split('T')[0]}.json"`
    );
    return res.send(JSON.stringify(payload, null, 2));
  }

  const flatRows = [
    { metric: 'totalUsers', value: dashboard.totalUsers },
    { metric: 'students', value: dashboard.students },
    { metric: 'teachers', value: dashboard.teachers },
    { metric: 'attendanceRate', value: dashboard.attendanceRate },
    { metric: 'absencesToday', value: dashboard.absences },
    { metric: 'averageGrade', value: academic.averageGrade },
    { metric: 'assignmentCompletionRate', value: academic.assignmentCompletionRate },
    { metric: 'messagesExchanged', value: academic.messagesExchanged },
    { metric: 'documentsShared', value: academic.documentsShared },
    { metric: 'newUsersThisPeriod', value: academic.newUsersThisMonth },
  ];
  const csv = toCsv(flatRows, [
    { key: 'metric', label: 'Métrique', value: (r) => r.metric },
    { key: 'value', label: 'Valeur', value: (r) => r.value },
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="analytics-report-${generatedAt.split('T')[0]}.csv"`
  );
  res.send(csv);
});
