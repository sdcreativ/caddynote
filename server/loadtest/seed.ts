import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/lib/password.js';
import { signAccessToken } from '../src/lib/jwt.js';
import { createSession } from '../src/lib/sessions.js';
import { ensureRoleExtension } from '../src/lib/roleExtensions.js';

/**
 * NFR-010 (Lot 11) — Tests de montée en charge : « rentrée » et
 * « publication massive de bulletins ».
 *
 * Prépare un établissement dédié, jetable et clairement identifiable
 * (`LOAD_TEST_MARKER` dans le nom), avec un volume réaliste de données
 * (classes, élèves, cours, notes en brouillon) pour que les scénarios k6
 * (rentree.js / bulletins.js) tapent sur de vraies requêtes Postgres, pas
 * sur une base vide qui ferait paraître l'API plus rapide qu'en réalité.
 *
 * Jetons pré-générés (pas de rafale de connexions HTTP au démarrage du
 * test) : `createSession` + `signAccessToken` sont exactement les deux
 * fonctions utilisées par `POST /auth/login` (voir `issueAccessToken`,
 * server/src/routes/auth.routes.ts) — chaque jeton généré ici correspond
 * donc à une vraie session en base, identique à ce qu'un login réel aurait
 * produit. Seule la vérification du mot de passe et le limiteur de
 * tentatives (`authLimiter`, 10 req/15min/IP) sont court-circuités —
 * délibérément : dans une vraie rentrée, des centaines d'utilisateurs se
 * connectent depuis autant d'adresses IP différentes, jamais depuis une
 * seule machine comme le fait un générateur de charge. Reproduire le
 * comportement du limiteur ici mesurerait le limiteur, pas l'API.
 */

const LOAD_TEST_MARKER = 'CADDYNOTE_LOADTEST';
const CLASS_COUNT = 8;
const STUDENTS_PER_CLASS = 28;
const SUBJECTS = ['Mathématiques', 'Français', 'Histoire-Géographie'];

const outputPath = process.argv[2] ?? path.join(process.cwd(), 'loadtest', 'output', 'session.json');

async function main() {
  console.log('== Nettoyage d’une éventuelle session de test précédente ==');
  const previous = await prisma.strkInstitution.findFirst({ where: { name: { startsWith: LOAD_TEST_MARKER } } });
  if (previous) {
    console.log(`  Trouvée (${previous.id}) — déléguée à cleanup.ts, exécutez-le d’abord si besoin.`);
    console.log('  Poursuite : un nouvel établissement horodaté est créé de toute façon.');
  }

  const institution = await prisma.strkInstitution.create({
    data: {
      name: `${LOAD_TEST_MARKER}_${Date.now()}`,
      type: 'middle_school',
      email: 'loadtest@example.invalid',
    },
  });
  console.log(`Établissement créé : ${institution.id}`);

  const passwordHash = await hashPassword('LoadTest#Password1');

  const admin = await prisma.strkProfile.create({
    data: {
      email: `loadtest-admin-${institution.id}@example.invalid`,
      passwordHash,
      firstName: 'Admin',
      lastName: 'LoadTest',
      role: 'school_admin',
      institutionId: institution.id,
    },
  });

  const teacher = await prisma.strkProfile.create({
    data: {
      email: `loadtest-teacher-${institution.id}@example.invalid`,
      passwordHash,
      firstName: 'Prof',
      lastName: 'LoadTest',
      role: 'teacher',
      institutionId: institution.id,
    },
  });
  // Bug réel trouvé en construisant ce seed (voir lib/roleExtensions.ts,
  // 16/08/2026) : StrkCourse.teacherId référence strk_teachers, pas
  // strk_profiles — sans cette ligne, aucun cours ne peut être créé avec ce
  // professeur, exactement ce que ce script a besoin de faire juste après.
  await ensureRoleExtension(teacher.id, 'teacher', institution.id);

  const period = await prisma.strkAcademicPeriod.create({
    data: {
      institutionId: institution.id,
      academicYear: '2026-2027',
      name: 'Trimestre 1',
      order: 1,
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-12-19'),
    },
  });

  const subjects = await Promise.all(
    SUBJECTS.map((name) => prisma.strkSubject.create({ data: { name, institutionId: institution.id } }))
  );

  console.log(`Création de ${CLASS_COUNT} classes × ${STUDENTS_PER_CLASS} élèves...`);
  const classes: { id: string; name: string; courseIds: string[]; studentIds: string[] }[] = [];
  const allStudentProfileIds: string[] = [];
  const gradeRows: {
    studentId: string;
    courseId: string;
    teacherId: string;
    gradeValue: number;
    title: string;
    periodId: string;
    status: 'draft';
  }[] = [];

  for (let c = 0; c < CLASS_COUNT; c++) {
    const klass = await prisma.strkClass.create({
      data: {
        name: `${LOAD_TEST_MARKER}-Classe-${c + 1}`,
        institutionId: institution.id,
        teacherId: teacher.id,
        academicYear: '2026-2027',
      },
    });

    // Un cours par matière pour cette classe (EVA-004 : nécessaire pour que
    // POST /grades/compute ait quelque chose à agréger par matière).
    const courses = await Promise.all(
      subjects.map((subject) =>
        prisma.strkCourse.create({
          data: {
            name: `${subject.name} - ${klass.name}`,
            institutionId: institution.id,
            teacherId: teacher.id,
            classId: klass.id,
            subjectId: subject.id,
            coefficient: 1,
          },
        })
      )
    );

    const studentProfiles = await Promise.all(
      Array.from({ length: STUDENTS_PER_CLASS }, (_, i) =>
        prisma.strkProfile.create({
          data: {
            email: `loadtest-student-${klass.id}-${i}@example.invalid`,
            passwordHash,
            firstName: `Elève${i}`,
            lastName: klass.name,
            role: 'student',
            institutionId: institution.id,
          },
        })
      )
    );

    await prisma.strkStudent.createMany({
      data: studentProfiles.map((p) => ({
        id: p.id,
        institutionId: institution.id,
        classId: klass.id,
        enrollmentDate: new Date('2026-09-01'),
      })),
    });

    classes.push({
      id: klass.id,
      name: klass.name,
      courseIds: courses.map((c) => c.id),
      studentIds: studentProfiles.map((p) => p.id),
    });

    for (const p of studentProfiles) {
      allStudentProfileIds.push(p.id);
      for (const course of courses) {
        gradeRows.push({
          studentId: p.id,
          courseId: course.id,
          teacherId: teacher.id,
          gradeValue: 8 + Math.round(Math.random() * 10),
          title: 'Devoir 1 (jeu de charge)',
          periodId: period.id,
          status: 'draft',
        });
      }
    }
  }

  console.log(`Insertion de ${gradeRows.length} notes en brouillon (createMany)...`);
  await prisma.strkGrade.createMany({ data: gradeRows });

  console.log('Génération des jetons (identique à un vrai login, sans le limiteur de tentatives)...');
  const mintToken = async (profile: { id: string; role: any; institutionId: string | null }) => {
    const session = await createSession({ userId: profile.id, userAgent: 'k6-loadtest', ipAddress: '127.0.0.1' });
    return signAccessToken({ sub: profile.id, role: profile.role, institutionId: profile.institutionId, sid: session.id });
  };

  const adminToken = await mintToken(admin);
  const teacherToken = await mintToken(teacher);
  const studentTokens: string[] = [];
  for (const id of allStudentProfileIds) {
    const profile = { id, role: 'student' as const, institutionId: institution.id };
    studentTokens.push(await mintToken(profile));
  }

  const session = {
    institutionId: institution.id,
    institutionName: institution.name,
    periodId: period.id,
    adminToken,
    teacherToken,
    studentTokens,
    classes,
    createdAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(session, null, 2));

  console.log('== Résumé ==');
  console.log(`  Établissement : ${institution.id} (${institution.name})`);
  console.log(`  Classes : ${classes.length}, élèves : ${allStudentProfileIds.length}, notes brouillon : ${gradeRows.length}`);
  console.log(`  Jetons écrits dans : ${outputPath}`);
  console.log('  Nettoyage : npx tsx loadtest/cleanup.ts ' + institution.id);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
