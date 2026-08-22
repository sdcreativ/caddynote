import crypto from 'node:crypto';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { signAccessToken, type JwtPayload } from '../lib/jwt.js';
import { createSession } from '../lib/sessions.js';

/**
 * Fixture partagée par la suite d'isolation multi-tenant (ORG-004) :
 * deux établissements indépendants ("a" et "b"), chacun avec son personnel
 * et un élève, plus un admin global (SDCREATIV) et un parent lié à l'élève
 * de l'établissement A. Toute la suite vérifie qu'un acteur de "b" (ou sans
 * lien) ne peut jamais lire/écrire une ressource de "a", et réciproquement.
 */

export interface Actor {
  token: string;
  id: string;
  email: string;
}

export interface TenantFixture {
  institutionId: string;
  schoolAdmin: Actor;
  teacher: Actor;
  student: Actor;
  classId: string;
  courseId: string;
  subjectId: string;
  periodId: string;
}

export interface Fixture {
  globalAdmin: Actor;
  a: TenantFixture;
  b: TenantFixture;
  parentA: Actor;
}

const rnd = () => crypto.randomBytes(6).toString('hex');

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** IAM-004 : un jeton d'accès valide exige désormais une session existante
 * (claim `sid`, cf. lib/jwt.ts) — pour les comptes créés directement via
 * Prisma plutôt que /auth/register (ex. `group_owner`, non auto-assignable),
 * ce helper crée la session avant de signer le jeton, comme le ferait
 * réellement `POST /auth/login`. */
export const issueTestToken = async (payload: Omit<JwtPayload, 'sid'>): Promise<string> => {
  const session = await createSession({ userId: payload.sub });
  return signAccessToken({ ...payload, sid: session.id });
};

export async function registerActor(
  role: 'admin' | 'school_admin' | 'teacher' | 'student' | 'parent',
  institutionId?: string
): Promise<Actor> {
  const email = `${role}.${rnd()}@isolation.test`;
  const res = await request(app)
    .post('/auth/register')
    .send({ email, password: 'Password123!', firstName: 'Test', lastName: role, role, institutionId });
  if (res.status !== 201) {
    throw new Error(`Échec de l'enregistrement de fixture (${role}) : ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.token as string, id: res.body.user.id as string, email };
}

async function buildTenant(globalAdminToken: string): Promise<TenantFixture> {
  const instRes = await request(app)
    .post('/institutions')
    .set(auth(globalAdminToken))
    .send({ name: `École ${rnd()}`, type: 'school' });
  if (instRes.status !== 201) {
    throw new Error(`Échec de création d'établissement de fixture : ${instRes.status} ${JSON.stringify(instRes.body)}`);
  }
  const institutionId = instRes.body.institution.id as string;

  const schoolAdmin = await registerActor('school_admin', institutionId);
  const teacher = await registerActor('teacher', institutionId);
  const student = await registerActor('student', institutionId);

  // Le gap disclosé ici (POST /auth/register ne créait pas les extensions
  // strk_students/strk_teachers) est corrigé le 16/08/2026 — voir
  // lib/roleExtensions.ts, appelé désormais par /auth/register lui-même.
  // Les deux lignes existent donc déjà à ce stade ; ne reste ici que la
  // mise à jour propre à ce test (rattachement à la classe, ci-dessous).

  const classRes = await request(app)
    .post('/classes')
    .set(auth(schoolAdmin.token))
    .send({ name: `Classe ${rnd()}`, institutionId, teacherId: teacher.id });
  const classId = classRes.body.class.id as string;

  // EVA-004 : l'élève doit être rattaché à la classe pour être inclus dans
  // le moteur de calcul de moyennes/rangs (StrkStudent.classId).
  await prisma.strkStudent.update({ where: { id: student.id }, data: { classId } });

  const subjectRes = await request(app)
    .post('/subjects')
    .set(auth(schoolAdmin.token))
    .send({ name: `Matière ${rnd()}`, institutionId });
  const subjectId = subjectRes.body.subject.id as string;

  const courseRes = await request(app)
    .post('/courses')
    .set(auth(schoolAdmin.token))
    .send({ name: `Cours ${rnd()}`, institutionId, teacherId: teacher.id, classId, subjectId, coefficient: 2 });
  const courseId = courseRes.body.course.id as string;

  const periodRes = await request(app)
    .post('/academic-periods')
    .set(auth(schoolAdmin.token))
    .send({
      institutionId,
      academicYear: '2025-2026',
      name: `Trimestre ${rnd()}`,
      order: 1,
      startDate: '2025-09-01',
      endDate: '2025-12-20',
    });
  const periodId = periodRes.body.period.id as string;

  return { institutionId, schoolAdmin, teacher, student, classId, courseId, subjectId, periodId };
}

export async function buildFixture(): Promise<Fixture> {
  const globalAdmin = await registerActor('admin');
  const [a, b] = await Promise.all([buildTenant(globalAdmin.token), buildTenant(globalAdmin.token)]);

  const parentA = await registerActor('parent');
  const linkRes = await request(app).post('/guardians').set(auth(a.schoolAdmin.token)).send({
    institutionId: a.institutionId,
    studentId: a.student.id,
    guardianId: parentA.id,
    relationship: 'father',
    canViewGrades: true,
    canViewAttendance: true,
    canViewBilling: true,
    canMakePayments: true,
  });
  if (linkRes.status !== 201) {
    throw new Error(`Échec de création du lien parent de fixture : ${linkRes.status} ${JSON.stringify(linkRes.body)}`);
  }

  return { globalAdmin, a, b, parentA };
}
