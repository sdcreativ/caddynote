import { prisma } from './prisma.js';
import { hashPassword } from './password.js';
import { generateTempPassword } from './tempPassword.js';
import { logAudit } from './audit.js';
import { sendAccountInvite } from './accountInvite.js';
import { parseCsvWithHeader } from './csvImport.js';
import { ensureRoleExtension } from './roleExtensions.js';
import type { StrkUserRole } from '@prisma/client';

/**
 * Chap. 22.1 — import CSV d’enseignants (reprise de données).
 * Colonnes : firstName, lastName, email, phoneNumber (opt.), role (opt. :
 * teacher | head_teacher, défaut teacher). Même principe que l’import
 * élèves (ELV-005) : une ligne en échec n’arrête pas le lot.
 */

export interface TeacherImportRowResult {
  row: number;
  email: string;
  status: 'created' | 'skipped_duplicate' | 'error';
  error?: string;
}

export interface TeacherImportSummary {
  results: TeacherImportRowResult[];
  created: number;
  skipped: number;
  errors: number;
}

const ALLOWED_ROLES = new Set<StrkUserRole>(['teacher', 'head_teacher']);

export const importTeachersFromCsv = async (
  csvText: string,
  institutionId: string,
  actorId: string
): Promise<TeacherImportSummary> => {
  const rows = parseCsvWithHeader(csvText);
  const results: TeacherImportRowResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const raw = rows[i];
    const email = raw.email?.trim().toLowerCase();
    const firstName = raw.firstName?.trim();
    const lastName = raw.lastName?.trim();
    const roleRaw = (raw.role?.trim().toLowerCase() || 'teacher') as StrkUserRole;

    if (!email || !firstName || !lastName) {
      results.push({
        row: rowNum,
        email: email || '(vide)',
        status: 'error',
        error: 'firstName, lastName et email sont requis',
      });
      continue;
    }

    if (!ALLOWED_ROLES.has(roleRaw)) {
      results.push({
        row: rowNum,
        email,
        status: 'error',
        error: 'role doit être teacher ou head_teacher',
      });
      continue;
    }

    const existing = await prisma.strkProfile.findUnique({ where: { email } });
    if (existing) {
      results.push({ row: rowNum, email, status: 'skipped_duplicate' });
      continue;
    }

    try {
      const tempPassword = generateTempPassword();
      const passwordHash = await hashPassword(tempPassword);
      const profile = await prisma.strkProfile.create({
        data: {
          email,
          firstName,
          lastName,
          role: roleRaw,
          institutionId,
          phoneNumber: raw.phoneNumber || undefined,
          passwordHash,
        },
      });
      await ensureRoleExtension(profile.id, roleRaw, institutionId);
      await sendAccountInvite({
        email,
        firstName,
        tempPassword,
        phoneNumber: raw.phoneNumber,
        accountKind: roleRaw === 'head_teacher' ? 'chef d’établissement' : 'enseignant',
      });
      results.push({ row: rowNum, email, status: 'created' });
    } catch (error) {
      results.push({
        row: rowNum,
        email,
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
    action: 'teacher.bulk_imported',
    metadata: { totalRows: rows.length, created, skipped, errors },
  });

  return { results, created, skipped, errors };
};
