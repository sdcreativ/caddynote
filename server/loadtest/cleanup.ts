import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';

/**
 * Supprime un établissement de test de charge (seed.ts) et toutes ses
 * données, dans l'ordre des dépendances (pas de `ON DELETE CASCADE` en
 * base pour la plupart de ces tables — un `deleteMany` par table dans le
 * mauvais ordre échouerait sur une contrainte de clé étrangère).
 *
 * Usage : npx tsx loadtest/cleanup.ts [institutionId]
 * Sans argument : supprime TOUS les établissements dont le nom commence par
 * le marqueur (utile pour nettoyer plusieurs runs oubliés d'un coup).
 */

const LOAD_TEST_MARKER = 'CADDYNOTE_LOADTEST';

async function cleanupInstitution(institutionId: string, name: string) {
  console.log(`Nettoyage de ${institutionId} (${name})...`);

  const classIds = (await prisma.strkClass.findMany({ where: { institutionId }, select: { id: true } })).map((c) => c.id);
  const courseIds = (await prisma.strkCourse.findMany({ where: { institutionId }, select: { id: true } })).map((c) => c.id);
  const studentIds = (await prisma.strkStudent.findMany({ where: { institutionId }, select: { id: true } })).map((s) => s.id);
  const profileIds = (await prisma.strkProfile.findMany({ where: { institutionId }, select: { id: true } })).map((p) => p.id);

  const counts: Record<string, number> = {};

  counts.documents = (await prisma.strkDocument.deleteMany({ where: { institutionId } })).count;
  counts.gradeComputations = (await prisma.strkGradeComputation.deleteMany({ where: { institutionId } })).count;
  counts.grades = courseIds.length
    ? (await prisma.strkGrade.deleteMany({ where: { courseId: { in: courseIds } } })).count
    : 0;
  counts.classSubjects = classIds.length
    ? (await prisma.strkClassSubject.deleteMany({ where: { classId: { in: classIds } } })).count
    : 0;
  counts.studentClasses = classIds.length
    ? (await prisma.strkStudentClass.deleteMany({ where: { classId: { in: classIds } } })).count
    : 0;
  counts.courses = (await prisma.strkCourse.deleteMany({ where: { institutionId } })).count;
  counts.healthInfo = studentIds.length
    ? (await prisma.strkStudentHealthInfo.deleteMany({ where: { studentId: { in: studentIds } } })).count
    : 0;
  counts.students = (await prisma.strkStudent.deleteMany({ where: { institutionId } })).count;
  counts.academicPeriods = (await prisma.strkAcademicPeriod.deleteMany({ where: { institutionId } })).count;
  counts.classes = (await prisma.strkClass.deleteMany({ where: { institutionId } })).count;
  counts.subjects = (await prisma.strkSubject.deleteMany({ where: { institutionId } })).count;
  counts.auditLogs = (await prisma.strkAuditLog.deleteMany({ where: { institutionId } })).count;
  counts.sessions = profileIds.length
    ? (await prisma.strkSession.deleteMany({ where: { userId: { in: profileIds } } })).count
    : 0;
  counts.profiles = (await prisma.strkProfile.deleteMany({ where: { institutionId } })).count;
  await prisma.strkInstitution.delete({ where: { id: institutionId } });

  console.log('  Supprimé :', counts);
}

async function main() {
  const arg = process.argv[2];
  if (arg) {
    const institution = await prisma.strkInstitution.findUnique({ where: { id: arg } });
    if (!institution) {
      console.error(`Établissement ${arg} introuvable.`);
      process.exit(1);
    }
    await cleanupInstitution(institution.id, institution.name);
    return;
  }

  const institutions = await prisma.strkInstitution.findMany({ where: { name: { startsWith: LOAD_TEST_MARKER } } });
  if (institutions.length === 0) {
    console.log('Aucun établissement de test de charge trouvé.');
    return;
  }
  for (const institution of institutions) {
    await cleanupInstitution(institution.id, institution.name);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
