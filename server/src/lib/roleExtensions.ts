import { prisma } from './prisma.js';
import type { StrkUserRole } from '@prisma/client';

/**
 * Bug réel trouvé et corrigé (16/08/2026, en préparant le test de charge
 * NFR-010) : un compte `StrkProfile` avec `role: 'student'` ou `'teacher'`
 * a besoin d'une ligne d'extension 1:1 correspondante (`StrkStudent` /
 * `StrkTeacher`, même id) pour être réellement utilisable — rattaché à une
 * classe, à un cours, aux notes, à l'appel. `StrkCourse.teacherId`
 * référence `strk_teachers` en base (pas `strk_profiles` directement,
 * contrairement à `StrkClass.teacherId`) ; tout ce qui touche à un élève
 * (présence, notes, bulletin, rattachement à une classe) est indexé sur
 * `StrkStudent`, jamais directement sur `StrkProfile`.
 *
 * Seuls les flux d'inscription dédiés (préinscription/admissions,
 * `lib/admissions.ts`, et import CSV, `lib/studentImport.ts`) créaient
 * cette ligne. La création générique d'un compte (`POST /auth/register`,
 * `POST /users`) et le changement de rôle (`PATCH /users/:id`) ne le
 * faisaient jamais : un enseignant créé par ce chemin ne pouvait être
 * affecté à AUCUN cours (`POST /courses` échouait avec une violation de
 * clé étrangère, jamais rattrapée -> 500 brut) ; un élève créé par ce
 * chemin n'apparaissait dans aucune classe/appel/bulletin. Les tests
 * existants avaient déjà contourné le problème en créant la ligne
 * d'extension à la main (`src/__tests__/fixtures.ts`), disclosé
 * explicitement comme hors périmètre à l'époque — traité ici pour de bon.
 *
 * Idempotent (upsert, jamais écrasé si déjà présent) ; sans institutionId
 * ne fait rien, un compte sans établissement (admin global, group_owner)
 * n'a pas vocation à avoir de ligne élève/enseignant. Ne supprime jamais
 * l'extension d'un ancien rôle après un changement de rôle : l'historique
 * (notes, présence...) reste rattaché à la ligne existante, même principe
 * de non-destruction que PER-005 (désactivation de compte).
 */
export const ensureRoleExtension = async (
  profileId: string,
  role: StrkUserRole,
  institutionId: string | null | undefined
): Promise<void> => {
  if (!institutionId) return;
  if (role === 'student') {
    await prisma.strkStudent.upsert({
      where: { id: profileId },
      create: { id: profileId, institutionId, enrollmentDate: new Date() },
      update: {},
    });
  } else if (role === 'teacher' || role === 'head_teacher') {
    await prisma.strkTeacher.upsert({
      where: { id: profileId },
      create: { id: profileId, institutionId },
      update: {},
    });
  }
};
