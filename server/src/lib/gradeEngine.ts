import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

/**
 * EVA-004 : moteur de calcul de moyennes/rangs versionné.
 *
 * Principes :
 *  - Seules les notes publiées ou corrigées comptent (jamais un brouillon —
 *    cf. EVA-005, `grades.routes.ts`).
 *  - Chaque note est d'abord normalisée sur 20 (barèmes multiples, EVA-002 :
 *    une évaluation notée sur 10 ou 100 pèse comme les autres une fois
 *    ramenée sur la même échelle).
 *  - Moyenne de matière = moyenne pondérée des notes par leur coefficient
 *    propre (`StrkGrade.coefficient` — un examen peut compter plus qu'un
 *    devoir).
 *  - Moyenne générale = moyenne des moyennes de matière, pondérée par le
 *    coefficient du cours (`StrkCourse.coefficient`).
 *  - Rang = position dans la classe pour cette période (classement standard
 *    "1,2,2,4" en cas d'égalité — convention scolaire française courante).
 *  - Résultat versionné : chaque exécution crée une nouvelle génération de
 *    lignes `StrkGradeComputation` (même `version` pour tout le lot), sans
 *    jamais réécrire les calculs précédents — traçabilité, cf. même
 *    principe que les documents (DOC-003) et gabarits (DOC-002).
 *
 * Limite assumée : seuls les cours explicitement rattachés à une matière
 * (`StrkCourse.subjectId` non nul) participent au calcul — un cours sans
 * matière est ignoré plutôt que de créer une ambiguïté entre "moyenne
 * générale" (subjectId=null dans `StrkGradeComputation`, par construction)
 * et "moyenne d'un cours sans matière" qui porterait la même valeur nulle.
 * Un établissement doit donc rattacher ses cours à une matière
 * (`PATCH /courses/:id`) avant de pouvoir calculer moyennes/rangs pour sa
 * classe. Si plusieurs cours partagent la même matière avec des
 * coefficients différents, le coefficient du premier cours rencontré est
 * utilisé pour cette matière (cas limite non représentatif d'un usage réel :
 * une matière n'a normalement qu'un seul cours par classe).
 */

const normalizeToTwenty = (value: number, maxGrade: number): number => (maxGrade > 0 ? (value / maxGrade) * 20 : 0);

const weightedAverage = (items: { value: number; weight: number }[]): number => {
  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
  if (totalWeight <= 0) return 0;
  return items.reduce((sum, i) => sum + i.value * i.weight, 0) / totalWeight;
};

/** Classement standard : des ex-aequo partagent le même rang, le rang
 * suivant est décalé du nombre d'ex-aequo (1, 2, 2, 4...). */
const rankDescending = (values: { key: string; average: number }[]): Map<string, number> => {
  const sorted = [...values].sort((a, b) => b.average - a.average);
  const ranks = new Map<string, number>();
  sorted.forEach((entry, index) => {
    if (index > 0 && sorted[index - 1].average === entry.average) {
      ranks.set(entry.key, ranks.get(sorted[index - 1].key)!);
    } else {
      ranks.set(entry.key, index + 1);
    }
  });
  return ranks;
};

export interface ComputeGradesParams {
  institutionId: string;
  classId: string;
  periodId: string;
  computedBy: string;
}

export interface SubjectAverageRow {
  subjectId: string;
  studentId: string;
  average: number;
}

export const computeClassPeriodGrades = async (params: ComputeGradesParams) => {
  const [period, klass, students, courses] = await Promise.all([
    prisma.strkAcademicPeriod.findUnique({ where: { id: params.periodId } }),
    prisma.strkClass.findUnique({ where: { id: params.classId } }),
    prisma.strkStudent.findMany({ where: { classId: params.classId }, select: { id: true } }),
    // Seuls les cours rattachés à une matière participent au calcul (cf.
    // limite assumée en tête de fichier).
    prisma.strkCourse.findMany({
      where: { classId: params.classId, subjectId: { not: null } },
      select: { id: true, subjectId: true, coefficient: true },
    }),
  ]);

  if (!period || period.institutionId !== params.institutionId) {
    throw new Error('PERIOD_NOT_FOUND');
  }
  if (!klass || klass.institutionId !== params.institutionId) {
    throw new Error('CLASS_NOT_FOUND');
  }
  if (students.length === 0) {
    throw new Error('NO_STUDENTS');
  }
  if (courses.length === 0) {
    throw new Error('NO_COURSES');
  }

  const studentIds = students.map((s) => s.id);
  const courseIds = courses.map((c) => c.id);
  const courseById = new Map(courses.map((c) => [c.id, c]));

  const grades = await prisma.strkGrade.findMany({
    where: {
      studentId: { in: studentIds },
      courseId: { in: courseIds },
      periodId: params.periodId,
      status: { in: ['published', 'corrected'] },
    },
    select: { studentId: true, courseId: true, gradeValue: true, maxGrade: true, coefficient: true },
  });

  // studentId -> subjectId -> notes normalisées
  const bySubject = new Map<string, Map<string, { value: number; weight: number }[]>>();
  // subjectId -> coefficient du cours (première rencontre)
  const subjectMeta = new Map<string, { coefficient: number }>();

  for (const grade of grades) {
    const course = courseById.get(grade.courseId);
    if (!course) continue;
    // Non-null : `courses` a été filtré sur subjectId non nul plus haut.
    const subjectId = course.subjectId!;
    if (!subjectMeta.has(subjectId)) {
      subjectMeta.set(subjectId, { coefficient: Number(course.coefficient) });
    }
    if (!bySubject.has(grade.studentId)) {
      bySubject.set(grade.studentId, new Map());
    }
    const studentSubjects = bySubject.get(grade.studentId)!;
    if (!studentSubjects.has(subjectId)) {
      studentSubjects.set(subjectId, []);
    }
    studentSubjects.get(subjectId)!.push({
      value: normalizeToTwenty(Number(grade.gradeValue), Number(grade.maxGrade)),
      weight: Number(grade.coefficient),
    });
  }

  // Moyenne par matière et par élève
  const subjectAverages: SubjectAverageRow[] = [];
  for (const [studentId, subjects] of bySubject) {
    for (const [subjectId, entries] of subjects) {
      subjectAverages.push({
        subjectId,
        studentId,
        average: weightedAverage(entries),
      });
    }
  }

  // Rang par matière (parmi les élèves ayant au moins une note dans cette matière)
  const subjectIds = [...subjectMeta.keys()];
  const subjectRanks = new Map<string, Map<string, number>>(); // subjectId -> studentId -> rank
  const subjectCohortSize = new Map<string, number>();
  for (const subjectId of subjectIds) {
    const rows = subjectAverages.filter((r) => r.subjectId === subjectId);
    subjectRanks.set(
      subjectId,
      rankDescending(rows.map((r) => ({ key: r.studentId, average: r.average })))
    );
    subjectCohortSize.set(subjectId, rows.length);
  }

  // Moyenne générale par élève (pondérée par le coefficient de matière)
  const overallByStudent = new Map<string, number>();
  for (const [studentId, subjects] of bySubject) {
    const items = [...subjects.keys()].map((subjectId) => ({
      value: weightedAverage(subjects.get(subjectId)!),
      weight: subjectMeta.get(subjectId)!.coefficient,
    }));
    overallByStudent.set(studentId, weightedAverage(items));
  }
  const overallRanks = rankDescending(
    [...overallByStudent.entries()].map(([studentId, average]) => ({ key: studentId, average }))
  );

  // Version : un seul numéro pour tout le lot généré par cette exécution.
  const previous = await prisma.strkGradeComputation.findFirst({
    where: { periodId: params.periodId, classId: params.classId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const version = (previous?.version ?? 0) + 1;
  const computedAt = new Date();

  const rows: Prisma.StrkGradeComputationCreateManyInput[] = [];

  for (const row of subjectAverages) {
    rows.push({
      institutionId: params.institutionId,
      periodId: params.periodId,
      classId: params.classId,
      studentId: row.studentId,
      subjectId: row.subjectId,
      average: row.average,
      rank: subjectRanks.get(row.subjectId)?.get(row.studentId) ?? null,
      studentCount: subjectCohortSize.get(row.subjectId) ?? 0,
      version,
      computedAt,
      computedBy: params.computedBy,
    });
  }
  for (const [studentId, average] of overallByStudent) {
    rows.push({
      institutionId: params.institutionId,
      periodId: params.periodId,
      classId: params.classId,
      studentId,
      subjectId: null,
      average,
      rank: overallRanks.get(studentId) ?? null,
      studentCount: overallByStudent.size,
      version,
      computedAt,
      computedBy: params.computedBy,
    });
  }

  if (rows.length === 0) {
    throw new Error('NO_PUBLISHED_GRADES');
  }

  await prisma.strkGradeComputation.createMany({ data: rows });

  return prisma.strkGradeComputation.findMany({
    where: { periodId: params.periodId, classId: params.classId, version },
    orderBy: [{ studentId: 'asc' }, { subjectId: 'asc' }],
  });
};

/** Dernière version calculée pour une classe/période (ou pour un élève
 * précis si fourni) — utilisé pour l'affichage et pour la génération du
 * bulletin (EVA-006). */
export const getLatestComputations = async (params: { classId: string; periodId: string; studentId?: string }) => {
  const latest = await prisma.strkGradeComputation.findFirst({
    where: { classId: params.classId, periodId: params.periodId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  if (!latest) return [];
  return prisma.strkGradeComputation.findMany({
    where: {
      classId: params.classId,
      periodId: params.periodId,
      version: latest.version,
      ...(params.studentId ? { studentId: params.studentId } : {}),
    },
    orderBy: [{ studentId: 'asc' }, { subjectId: 'asc' }],
  });
};

export type StudentSubjectGradeBucket = {
  key: string;
  subjectId: string | null;
  subjectName: string;
  courseId: string | null;
  courseName: string | null;
  courseCoefficient: number;
  averageOutOf20: number | null;
  grades: Array<{
    id: string;
    title: string;
    gradeValue: number;
    maxGrade: number;
    coefficient: number;
    date: string;
    gradeType: string;
    normalizedOutOf20: number;
    periodId: string | null;
  }>;
};

/**
 * Résumé parent/élève : notes publiées regroupées par matière (ou cours
 * sans matière), avec moyenne /20 par groupe et moyenne générale pondérée
 * par le coefficient du cours. Ne dépend pas d’un calcul de rang direction.
 */
export const getStudentGradeSummary = async (params: {
  studentId: string;
  periodId?: string;
}): Promise<{ subjects: StudentSubjectGradeBucket[]; overallAverageOutOf20: number | null }> => {
  const grades = await prisma.strkGrade.findMany({
    where: {
      studentId: params.studentId,
      status: { in: ['published', 'corrected'] },
      ...(params.periodId ? { periodId: params.periodId } : {}),
    },
    orderBy: { date: 'desc' },
    select: {
      id: true,
      title: true,
      gradeValue: true,
      maxGrade: true,
      coefficient: true,
      date: true,
      gradeType: true,
      periodId: true,
      courseId: true,
    },
  });

  if (grades.length === 0) {
    return { subjects: [], overallAverageOutOf20: null };
  }

  const courseIds = [...new Set(grades.map((g) => g.courseId))];
  const courses = await prisma.strkCourse.findMany({
    where: { id: { in: courseIds } },
    select: {
      id: true,
      name: true,
      coefficient: true,
      subjectId: true,
      subject: { select: { id: true, name: true } },
    },
  });
  const courseById = new Map(courses.map((c) => [c.id, c]));

  const buckets = new Map<
    string,
    {
      meta: StudentSubjectGradeBucket;
      entries: { value: number; weight: number }[];
    }
  >();

  for (const grade of grades) {
    const course = courseById.get(grade.courseId);
    const subjectId = course?.subjectId ?? null;
    const key = subjectId ?? `course:${grade.courseId}`;
    const subjectName = course?.subject?.name || course?.name || 'Cours';
    const courseCoefficient = Number(course?.coefficient ?? 1) || 1;
    const maxGrade = Number(grade.maxGrade);
    const gradeValue = Number(grade.gradeValue);
    const coefficient = Number(grade.coefficient) || 1;
    const normalized = normalizeToTwenty(gradeValue, maxGrade);

    if (!buckets.has(key)) {
      buckets.set(key, {
        meta: {
          key,
          subjectId,
          subjectName,
          courseId: course?.id ?? grade.courseId,
          courseName: course?.name ?? null,
          courseCoefficient,
          averageOutOf20: null,
          grades: [],
        },
        entries: [],
      });
    }
    const bucket = buckets.get(key)!;
    bucket.entries.push({ value: normalized, weight: coefficient });
    bucket.meta.grades.push({
      id: grade.id,
      title: grade.title,
      gradeValue,
      maxGrade,
      coefficient,
      date: grade.date.toISOString(),
      gradeType: grade.gradeType,
      normalizedOutOf20: Math.round(normalized * 100) / 100,
      periodId: grade.periodId,
    });
  }

  const subjects: StudentSubjectGradeBucket[] = [...buckets.values()].map(({ meta, entries }) => {
    const avg = entries.length ? weightedAverage(entries) : null;
    return {
      ...meta,
      averageOutOf20: avg == null ? null : Math.round(avg * 100) / 100,
    };
  });

  subjects.sort((a, b) => a.subjectName.localeCompare(b.subjectName, 'fr'));

  const overallItems = subjects
    .filter((s) => s.averageOutOf20 != null)
    .map((s) => ({ value: s.averageOutOf20!, weight: s.courseCoefficient }));
  const overall =
    overallItems.length > 0 ? Math.round(weightedAverage(overallItems) * 100) / 100 : null;

  return { subjects, overallAverageOutOf20: overall };
};
