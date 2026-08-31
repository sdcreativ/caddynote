import { prisma } from './prisma.js';
import { hashPassword } from './password.js';
import { generateTempPassword } from './tempPassword.js';
import { logAudit } from './audit.js';
import { sendAccountInvite } from './accountInvite.js';
import { parseCsvWithHeader } from './csvImport.js';
import { parseStudentGender } from './studentGender.js';
import { normalizeEmail } from './emailNormalize.js';

/**
 * ELV-005 : import en masse d'élèves (colonnes attendues : firstName,
 * lastName, email, phoneNumber, className, studentNumber, gender —
 * className, studentNumber et gender facultatifs ; gender accepte
 * female/male ou fille/garçon). Une ligne en échec (doublon d'e-mail, champ
 * requis manquant) n'interrompt jamais tout le lot — chaque ligne est
 * rapportée individuellement (même principe que la détection de doublons
 * non bloquante des admissions, PRS-005/lib/admissions.ts).
 */

export interface StudentImportRowResult {
  row: number;
  email: string;
  status: 'created' | 'skipped_duplicate' | 'error';
  error?: string;
}

export interface StudentImportSummary {
  results: StudentImportRowResult[];
  created: number;
  skipped: number;
  errors: number;
}

export const importStudentsFromCsv = async (
  csvText: string,
  institutionId: string,
  actorId: string
): Promise<StudentImportSummary> => {
  const rows = parseCsvWithHeader(csvText);
  const results: StudentImportRowResult[] = [];

  // Résolution des noms de classe une seule fois plutôt qu'une requête par ligne.
  const classes = await prisma.strkClass.findMany({ where: { institutionId }, select: { id: true, name: true } });
  const classIdByName = new Map(classes.map((c) => [c.name.trim().toLowerCase(), c.id]));

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2; // ligne 1 = en-tête, lignes de données à partir de 2
    const raw = rows[i];
    const email = raw.email ? normalizeEmail(raw.email) : '';
    const firstName = raw.firstName?.trim();
    const lastName = raw.lastName?.trim();

    if (!email || !firstName || !lastName) {
      results.push({
        row: rowNum,
        email: email || '(vide)',
        status: 'error',
        error: 'firstName, lastName et email sont requis',
      });
      continue;
    }

    const existing = await prisma.strkProfile.findUnique({ where: { email } });
    if (existing) {
      results.push({ row: rowNum, email, status: 'skipped_duplicate' });
      continue;
    }

    const classId = raw.className ? classIdByName.get(raw.className.trim().toLowerCase()) : undefined;
    const genderRaw = raw.gender?.trim();
    const gender = genderRaw ? parseStudentGender(genderRaw) : null;
    if (genderRaw && !gender) {
      results.push({
        row: rowNum,
        email,
        status: 'error',
        error: 'gender invalide (fille/garçon ou female/male)',
      });
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
          role: 'student',
          institutionId,
          phoneNumber: raw.phoneNumber || undefined,
          passwordHash,
          mustChangePassword: true,
        },
      });
      await prisma.strkStudent.create({
        data: {
          id: profile.id,
          institutionId,
          classId,
          studentNumber: raw.studentNumber || undefined,
          gender: gender ?? undefined,
        },
      });
      // IAM-001 : même invitation que POST /users (e-mail + SMS si téléphone).
      await sendAccountInvite({
        email,
        firstName,
        tempPassword,
        phoneNumber: raw.phoneNumber,
        accountKind: 'élève',
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

  // ELV-005 : traçabilité de l'import lui-même (qui, quand, combien) — pas
  // seulement de chaque compte créé individuellement (déjà couvert par
  // l'audit `user.created` habituel... sauf que l'import ne l'émet pas par
  // compte pour ne pas noyer le journal sous des centaines d'entrées
  // identiques ; cette entrée de lot est la trace faisant foi).
  await logAudit({
    institutionId,
    actorId,
    action: 'student.bulk_imported',
    metadata: { totalRows: rows.length, created, skipped, errors },
  });

  return { results, created, skipped, errors };
};
