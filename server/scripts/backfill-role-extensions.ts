import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';
import { ensureRoleExtension } from '../src/lib/roleExtensions.js';

/**
 * Backfill unique, à exécuter une fois après le déploiement du correctif
 * `lib/roleExtensions.ts` (16/08/2026) : tout compte `teacher`/`student`
 * créé AVANT ce correctif (via `POST /auth/register`, `POST /users`, ou un
 * changement de rôle `PATCH /users/:id`) n'a pas de ligne `StrkTeacher` /
 * `StrkStudent` correspondante — inutilisable pour tout ce qui indexe
 * dessus (affectation à un cours, appel, notes...) tant que ce script (ou
 * une action manuelle équivalente) n'a pas tourné.
 *
 * Usage : npx tsx scripts/backfill-role-extensions.ts
 * Idempotent (ensureRoleExtension fait un upsert) — sans risque à relancer.
 */
async function main() {
  const orphanedTeachers = await prisma.strkProfile.findMany({
    where: { role: 'teacher', institutionId: { not: null }, teacherExtension: { is: null } },
    select: { id: true, institutionId: true },
  });
  const orphanedStudents = await prisma.strkProfile.findMany({
    where: { role: 'student', institutionId: { not: null }, studentExtension: { is: null } },
    select: { id: true, institutionId: true },
  });

  console.log(`Enseignants sans ligne StrkTeacher : ${orphanedTeachers.length}`);
  console.log(`Élèves sans ligne StrkStudent : ${orphanedStudents.length}`);

  for (const t of [...orphanedTeachers, ...orphanedStudents]) {
    // Le rôle réel a déjà servi de critère de filtre ci-dessus ; on relit
    // le profil pour passer le bon rôle à ensureRoleExtension.
    const profile = await prisma.strkProfile.findUnique({ where: { id: t.id }, select: { role: true, institutionId: true } });
    if (!profile) continue;
    await ensureRoleExtension(t.id, profile.role, profile.institutionId);
  }

  console.log('Backfill terminé.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
