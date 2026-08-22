import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, registerActor, auth, type Fixture } from './fixtures.js';

/**
 * Bug réel trouvé en préparant le test de charge NFR-010 : un compte
 * `StrkProfile` (`teacher`/`student`) créé via un chemin générique
 * (`/auth/register`, `POST /users`, `PATCH /users/:id` changement de rôle)
 * n'avait jamais de ligne d'extension `StrkTeacher`/`StrkStudent`
 * correspondante — les tests existants contournaient déjà le problème en
 * la créant à la main dans les fixtures (disclosed comme hors périmètre à
 * l'époque). Conséquence concrète vérifiée ci-dessous : sans le correctif,
 * `POST /courses` avec un `teacherId` d'un enseignant fraîchement enregistré
 * échouait avec une violation de clé étrangère (`strk_courses_teacher_id_fkey`
 * -> `strk_teachers`, jamais `strk_profiles`).
 */
describe('Extensions de rôle (StrkTeacher/StrkStudent) à la création de compte', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it('POST /auth/register (teacher) crée la ligne StrkTeacher, utilisable immédiatement pour un cours', async () => {
    const teacher = await registerActor('teacher', fx.a.institutionId);

    const extension = await prisma.strkTeacher.findUnique({ where: { id: teacher.id } });
    expect(extension).not.toBeNull();
    expect(extension?.institutionId).toBe(fx.a.institutionId);

    const courseRes = await request(app)
      .post('/courses')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ name: 'Cours du nouvel enseignant', institutionId: fx.a.institutionId, teacherId: teacher.id });
    expect(courseRes.status).toBe(201);
    expect(courseRes.body.course.teacherId).toBe(teacher.id);
  });

  it('POST /auth/register (student) crée la ligne StrkStudent', async () => {
    const student = await registerActor('student', fx.a.institutionId);
    const extension = await prisma.strkStudent.findUnique({ where: { id: student.id } });
    expect(extension).not.toBeNull();
    expect(extension?.institutionId).toBe(fx.a.institutionId);
  });

  it('POST /users (personnel crée un compte) crée aussi la ligne d’extension', async () => {
    const res = await request(app)
      .post('/users')
      .set(auth(fx.a.schoolAdmin.token))
      .send({
        email: `loadtest-check-${Date.now()}@example.invalid`,
        firstName: 'Nouveau',
        lastName: 'Prof',
        role: 'teacher',
        institutionId: fx.a.institutionId,
      });
    expect(res.status).toBe(201);
    const extension = await prisma.strkTeacher.findUnique({ where: { id: res.body.user.id } });
    expect(extension).not.toBeNull();
  });

  it('PATCH /users/:id changeant le rôle vers teacher crée l’extension manquante', async () => {
    // Un compte parent n'a par nature aucune extension élève/enseignant.
    // Seul l'admin global peut changer le rôle d'un tiers (usersRouter.patch,
    // isGlobalAdmin) — on le rattache d'abord à l'établissement pour que
    // l'extension créée porte un institutionId valide.
    const parent = await registerActor('parent');
    await prisma.strkProfile.update({ where: { id: parent.id }, data: { institutionId: fx.a.institutionId } });

    const res = await request(app)
      .patch(`/users/${parent.id}`)
      .set(auth(fx.globalAdmin.token))
      .send({ role: 'teacher' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('teacher');

    const extension = await prisma.strkTeacher.findUnique({ where: { id: parent.id } });
    expect(extension).not.toBeNull();
    expect(extension?.institutionId).toBe(fx.a.institutionId);
  });

  it('un compte sans établissement (admin global) n’a pas d’extension et ne plante rien', async () => {
    const before = await prisma.strkTeacher.count();
    await registerActor('admin');
    const after = await prisma.strkTeacher.count();
    expect(after).toBe(before);
  });

  it('POST /users (head_teacher) crée aussi la ligne StrkTeacher', async () => {
    const res = await request(app)
      .post('/users')
      .set(auth(fx.a.schoolAdmin.token))
      .send({
        email: `head-teacher-${Date.now()}@example.invalid`,
        firstName: 'Prof',
        lastName: 'Principal',
        role: 'head_teacher',
        institutionId: fx.a.institutionId,
      });
    expect(res.status).toBe(201);
    expect(res.body.emailSent).toBe(false);
    expect(res.body.smsSent).toBe(false);
    const extension = await prisma.strkTeacher.findUnique({ where: { id: res.body.user.id } });
    expect(extension).not.toBeNull();
  });

  it('POST /users accepte le rôle secretary', async () => {
    const res = await request(app)
      .post('/users')
      .set(auth(fx.a.schoolAdmin.token))
      .send({
        email: `secretary-${Date.now()}@example.invalid`,
        firstName: 'Sec',
        lastName: 'Retariat',
        role: 'secretary',
        institutionId: fx.a.institutionId,
      });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('secretary');
  });
});
