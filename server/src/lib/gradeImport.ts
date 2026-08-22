import { prisma } from './prisma.js';
import { parseCsvWithHeader } from './csvImport.js';
import { logAudit } from './audit.js';

/**
 * EVA-003 : import tableur de notes (CSV).
 * Colonnes : studentNumber OU email, gradeValue.
 * Métadonnées communes (courseId, teacherId, periodId, title, …) passées
 * dans le corps de la requête — même modèle que POST /grades/bulk.
 * Une ligne en échec n'interrompt pas le lot (comme studentImport).
 */

export interface GradeImportRowResult {
  row: number;
  key: string;
  status: 'created' | 'skipped' | 'error';
  error?: string;
}

export interface GradeImportSummary {
  results: GradeImportRowResult[];
  created: number;
  skipped: number;
  errors: number;
}

export interface GradeImportMeta {
  courseId: string;
  teacherId: string;
  periodId: string;
  title: string;
  gradeType?: string;
  maxGrade?: number;
  coefficient?: number;
  date?: string;
  institutionId: string;
  actorId: string;
}

export const importGradesFromCsv = async (
  csvText: string,
  meta: GradeImportMeta
): Promise<GradeImportSummary> => {
  const rows = parseCsvWithHeader(csvText);
  const results: GradeImportRowResult[] = [];

  const students = await prisma.strkStudent.findMany({
    where: { institutionId: meta.institutionId },
    include: { profile: { select: { email: true } } },
  });
  const byNumber = new Map(
    students.filter((s) => s.studentNumber).map((s) => [s.studentNumber!.trim().toLowerCase(), s.id])
  );
  const byEmail = new Map(
    students
      .filter((s) => s.profile.email)
      .map((s) => [s.profile.email!.trim().toLowerCase(), s.id])
  );

  let created = 0;
  let skipped = 0;
  let errors = 0;
  const toCreate: {
    studentId: string;
    courseId: string;
    teacherId: string;
    periodId: string;
    title: string;
    gradeType: string;
    maxGrade: number;
    coefficient: number;
    gradeValue: number;
    date?: Date;
    status: 'draft';
  }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const raw = rows[i];
    const studentNumber = raw.studentNumber?.trim().toLowerCase();
    const email = raw.email?.trim().toLowerCase();
    const gradeRaw = raw.gradeValue?.trim() ?? raw.grade?.trim();
    const key = studentNumber || email || `(ligne ${rowNum})`;

    if (!gradeRaw || Number.isNaN(Number(gradeRaw))) {
      results.push({ row: rowNum, key, status: 'error', error: 'gradeValue invalide' });
      errors++;
      continue;
    }
    const studentId = (studentNumber && byNumber.get(studentNumber)) || (email && byEmail.get(email));
    if (!studentId) {
      results.push({ row: rowNum, key, status: 'error', error: 'Élève introuvable (studentNumber ou email)' });
      errors++;
      continue;
    }

    toCreate.push({
      studentId,
      courseId: meta.courseId,
      teacherId: meta.teacherId,
      periodId: meta.periodId,
      title: meta.title,
      gradeType: meta.gradeType ?? 'exam',
      maxGrade: meta.maxGrade ?? 20,
      coefficient: meta.coefficient ?? 1,
      gradeValue: Number(gradeRaw),
      date: meta.date ? new Date(meta.date) : undefined,
      status: 'draft',
    });
    results.push({ row: rowNum, key, status: 'created' });
    created++;
  }

  if (toCreate.length > 0) {
    await prisma.strkGrade.createMany({ data: toCreate });
  }

  await logAudit({
    institutionId: meta.institutionId,
    actorId: meta.actorId,
    action: 'grade.bulk_imported',
    targetType: 'course',
    targetId: meta.courseId,
    metadata: { created, skipped, errors, title: meta.title, periodId: meta.periodId },
  });

  return { results, created, skipped, errors };
};
