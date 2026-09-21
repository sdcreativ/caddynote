/**
 * Identifiants pour scripts de recette / smoke / pentest-prep.
 * Plus aucun défaut démo (@caddynote.test / Test1234!).
 *
 * Exemple :
 *   RECETTE_PASSWORD='…' \
 *   RECETTE_ADMIN_EMAIL='admin@ecole.fr' \
 *   RECETTE_SCHOOL_ADMIN_EMAIL='direction@ecole.fr' \
 *   RECETTE_TEACHER_EMAIL='…' \
 *   RECETTE_STUDENT_EMAIL='…' \
 *   RECETTE_PARENT_EMAIL='…' \
 *   npm run recette:pilot
 */
const FORBIDDEN_PASSWORD = new Set(['Test1234!', 'Password123!', 'password']);

const requireEnv = (name: string, fallbacks: string[] = []): string => {
  for (const key of [name, ...fallbacks]) {
    const v = process.env[key]?.trim();
    if (v) return v;
  }
  throw new Error(
    `${name} manquant. Les comptes démo ont été retirés — définissez les variables RECETTE_* ` +
      '(voir server/.env.example / VARIABLES_ENVIRONNEMENT_PRODUCTION.md).'
  );
};

export const getRecettePassword = (): string => {
  const password = requireEnv('RECETTE_PASSWORD', ['SMOKE_PASSWORD', 'PENTEST_PREP_PASSWORD']);
  if (FORBIDDEN_PASSWORD.has(password)) {
    throw new Error('Mot de passe démo interdit — utilisez un secret dédié (RECETTE_PASSWORD)');
  }
  return password;
};

export type RecetteRole =
  | 'admin'
  | 'school_admin'
  | 'teacher'
  | 'head_teacher'
  | 'student'
  | 'parent'
  | 'staff'
  | 'secretary'
  | 'accountant'
  | 'supervisor';

const EMAIL_ENV: Record<RecetteRole, string[]> = {
  admin: ['RECETTE_ADMIN_EMAIL', 'SMOKE_EMAIL', 'PENTEST_ADMIN_EMAIL'],
  school_admin: ['RECETTE_SCHOOL_ADMIN_EMAIL', 'RECETTE_DIRECTION_EMAIL'],
  teacher: ['RECETTE_TEACHER_EMAIL'],
  head_teacher: ['RECETTE_HEAD_TEACHER_EMAIL', 'RECETTE_TEACHER_EMAIL'],
  student: ['RECETTE_STUDENT_EMAIL'],
  parent: ['RECETTE_PARENT_EMAIL'],
  staff: ['RECETTE_STAFF_EMAIL', 'RECETTE_SECRETARY_EMAIL'],
  secretary: ['RECETTE_SECRETARY_EMAIL', 'RECETTE_STAFF_EMAIL'],
  accountant: ['RECETTE_ACCOUNTANT_EMAIL', 'RECETTE_STAFF_EMAIL'],
  supervisor: ['RECETTE_SUPERVISOR_EMAIL', 'RECETTE_STAFF_EMAIL'],
};

export const getRecetteEmail = (role: RecetteRole): string => {
  const email = requireEnv(EMAIL_ENV[role][0], EMAIL_ENV[role].slice(1)).toLowerCase();
  if (email.endsWith('@caddynote.test')) {
    throw new Error(`E-mail démo interdit (${email}) — utilisez un compte réel de votre base`);
  }
  return email;
};

/** `null` si la variable manque ; lève si un e-mail démo est fourni. */
export const tryGetRecetteEmail = (role: RecetteRole): string | null => {
  const keys = EMAIL_ENV[role];
  const present = keys.some((key) => Boolean(process.env[key]?.trim()));
  if (!present) return null;
  return getRecetteEmail(role);
};

export const tryGetRecettePassword = (): string | null => {
  const keys = ['RECETTE_PASSWORD', 'SMOKE_PASSWORD', 'PENTEST_PREP_PASSWORD'];
  if (!keys.some((key) => Boolean(process.env[key]?.trim()))) return null;
  return getRecettePassword();
};

export const getRecetteLogin = (role: RecetteRole): { email: string; password: string } => ({
  email: getRecetteEmail(role),
  password: getRecettePassword(),
});
