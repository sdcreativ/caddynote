import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { auth, buildFixture, type Fixture } from './fixtures.js';

/**
 * Unicité globale de l’e-mail sur StrkProfile (tous rôles, casse ignorée).
 */
describe('Unicité e-mail globale', () => {
  let fx: Fixture;
  const stamp = Date.now();
  const base = `unique.email.${stamp}@isolation.test`;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 60000);

  afterAll(async () => {
    await prisma.strkProfile
      .deleteMany({
        where: {
          OR: [
            { email: { contains: `unique.email.${stamp}` } },
            { email: { contains: `login.case.${stamp}` } },
            { email: { contains: `other.email.${stamp}` } },
          ],
        },
      })
      .catch(() => {});
  });

  it('refuse un second compte avec le même e-mail (casse différente, autre rôle)', async () => {
    const createTeacher = await request(app)
      .post('/users')
      .set(auth(fx.a.schoolAdmin.token))
      .send({
        email: base.toUpperCase(),
        firstName: 'Prem',
        lastName: 'Unique',
        role: 'teacher',
      });
    expect(createTeacher.status).toBe(201);
    expect(createTeacher.body.user.email).toBe(base.toLowerCase());

    const createStudent = await request(app)
      .post('/users')
      .set(auth(fx.a.schoolAdmin.token))
      .send({
        email: base,
        firstName: 'Sec',
        lastName: 'Unique',
        role: 'student',
      });
    expect(createStudent.status).toBe(409);
    expect(createStudent.body.error).toMatch(/e-mail/i);

    const createParentOtherTenant = await request(app)
      .post('/users')
      .set(auth(fx.b.schoolAdmin.token))
      .send({
        email: `  ${base.toUpperCase()}  `,
        firstName: 'Autre',
        lastName: 'École',
        role: 'parent',
      });
    expect(createParentOtherTenant.status).toBe(409);
  });

  it('autorise la connexion avec une casse différente', async () => {
    const email = `login.case.${stamp}@isolation.test`;
    const reg = await request(app)
      .post('/auth/register')
      .send({
        email: email.toUpperCase(),
        password: 'Password123!',
        firstName: 'Case',
        lastName: 'Login',
        role: 'teacher',
        institutionId: fx.a.institutionId,
      });
    expect(reg.status).toBe(201);
    expect(reg.body.user.email).toBe(email.toLowerCase());

    const ok = await request(app)
      .post('/auth/login')
      .send({ email: email.toUpperCase(), password: 'Password123!' });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();
  });

  it('refuse PATCH e-mail déjà pris par un autre profil', async () => {
    const other = `other.email.${stamp}@isolation.test`;
    const created = await request(app)
      .post('/users')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ email: other, firstName: 'Autre', lastName: 'Profil', role: 'secretary' });
    expect(created.status).toBe(201);

    const patch = await request(app)
      .patch(`/users/${created.body.user.id}`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ email: fx.a.teacher.email.toUpperCase() });
    expect(patch.status).toBe(409);
  });
});
