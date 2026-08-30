import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';
import { prisma } from '../lib/prisma.js';
import { buildOpaqueStudentLogin } from '../lib/studentLogin.js';

describe('Provisionnement accès élève (fiche / activate-login / reset)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it('crée une fiche sans login puis active un alias opaque + reset Direction', async () => {
    const created = await request(app)
      .post('/students')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ firstName: 'Awa', lastName: 'Traoré', classId: fx.a.classId });
    expect(created.status).toBe(201);
    expect(created.body.withLogin).toBe(false);
    expect(created.body.user.email).toBeNull();
    const studentId = created.body.user.id as string;

    const row = await prisma.strkStudent.findUnique({ where: { id: studentId } });
    expect(row?.classId).toBe(fx.a.classId);

    const activated = await request(app)
      .post(`/students/${studentId}/activate-login`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({});
    expect(activated.status).toBe(201);
    expect(activated.body.loginMode).toBe('opaque');
    expect(activated.body.email).toBe(buildOpaqueStudentLogin(studentId));
    expect(activated.body.tempPassword).toBeTruthy();
    expect(activated.body.emailSent).toBe(false);

    const again = await request(app)
      .post(`/students/${studentId}/activate-login`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({});
    expect(again.status).toBe(409);

    const reset = await request(app)
      .post(`/users/${studentId}/admin-reset-password`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({});
    expect(reset.status).toBe(200);
    expect(reset.body.tempPassword).toBeTruthy();
    expect(reset.body.email).toBe(activated.body.email);

    const cross = await request(app)
      .post(`/students/${studentId}/activate-login`)
      .set(auth(fx.b.schoolAdmin.token))
      .send({ email: 'awa.autre@example.com' });
    expect([403, 404]).toContain(cross.status);
  });

  it('active avec e-mail réel famille', async () => {
    const created = await request(app)
      .post('/students')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ firstName: 'Jean', lastName: 'Kouassi' });
    expect(created.status).toBe(201);
    const studentId = created.body.user.id as string;
    const email = `jean.kouassi.${Date.now()}@famille.test`;

    const activated = await request(app)
      .post(`/students/${studentId}/activate-login`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ email });
    expect(activated.status).toBe(201);
    expect(activated.body.loginMode).toBe('email');
    expect(activated.body.email).toBe(email.toLowerCase());
    expect(activated.body.tempPassword).toBeTruthy();
  });
});
