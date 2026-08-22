import { prisma } from './prisma.js';
import { logAudit } from './audit.js';
import { parseCsvWithHeader } from './csvImport.js';

/**
 * Chap. 22.1 — import CSV de classes (reprise de données).
 * Colonnes : name (requis), academicYear, description, maxStudents,
 * teacherEmail (opt. — enseignant déjà présent dans l’établissement).
 * Doublon = même nom (insensible à la casse) déjà actif dans l’établissement.
 */

export interface ClassImportRowResult {
  row: number;
  key: string;
  status: 'created' | 'skipped_duplicate' | 'error';
  error?: string;
}

export interface ClassImportSummary {
  results: ClassImportRowResult[];
  created: number;
  skipped: number;
  errors: number;
}

export const importClassesFromCsv = async (
  csvText: string,
  institutionId: string,
  actorId: string
): Promise<ClassImportSummary> => {
  const rows = parseCsvWithHeader(csvText);
  const results: ClassImportRowResult[] = [];

  const existing = await prisma.strkClass.findMany({
    where: { institutionId, isActive: true },
    select: { id: true, name: true },
  });
  const classIdByName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c.id]));

  const teachers = await prisma.strkProfile.findMany({
    where: { institutionId, role: { in: ['teacher', 'head_teacher'] } },
    select: { id: true, email: true },
  });
  const teacherIdByEmail = new Map(
    teachers
      .filter((t): t is typeof t & { email: string } => Boolean(t.email))
      .map((t) => [t.email.toLowerCase(), t.id])
  );

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const raw = rows[i];
    const name = raw.name?.trim();
    const key = name || '(vide)';

    if (!name) {
      results.push({ row: rowNum, key, status: 'error', error: 'name est requis' });
      continue;
    }

    const nameKey = name.toLowerCase();
    if (classIdByName.has(nameKey)) {
      results.push({ row: rowNum, key: name, status: 'skipped_duplicate' });
      continue;
    }

    let teacherId: string | undefined;
    if (raw.teacherEmail?.trim()) {
      teacherId = teacherIdByEmail.get(raw.teacherEmail.trim().toLowerCase());
      if (!teacherId) {
        results.push({
          row: rowNum,
          key: name,
          status: 'error',
          error: `enseignant introuvable pour ${raw.teacherEmail.trim()}`,
        });
        continue;
      }
    }

    let maxStudents: number | undefined;
    if (raw.maxStudents?.trim()) {
      const parsed = Number(raw.maxStudents.trim());
      if (!Number.isInteger(parsed) || parsed <= 0) {
        results.push({
          row: rowNum,
          key: name,
          status: 'error',
          error: 'maxStudents doit être un entier positif',
        });
        continue;
      }
      maxStudents = parsed;
    }

    try {
      const klass = await prisma.strkClass.create({
        data: {
          name,
          institutionId,
          teacherId,
          description: raw.description?.trim() || undefined,
          academicYear: raw.academicYear?.trim() || undefined,
          maxStudents,
        },
      });
      classIdByName.set(nameKey, klass.id);
      results.push({ row: rowNum, key: name, status: 'created' });
    } catch (error) {
      results.push({
        row: rowNum,
        key: name,
        status: 'error',
        error: error instanceof Error ? error.message : 'Erreur inconnue',
      });
    }
  }

  const created = results.filter((r) => r.status === 'created').length;
  const skipped = results.filter((r) => r.status === 'skipped_duplicate').length;
  const errors = results.filter((r) => r.status === 'error').length;

  await logAudit({
    institutionId,
    actorId,
    action: 'class.bulk_imported',
    metadata: { totalRows: rows.length, created, skipped, errors },
  });

  return { results, created, skipped, errors };
};
