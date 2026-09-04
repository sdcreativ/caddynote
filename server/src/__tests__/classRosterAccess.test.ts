import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { auth, buildFixture, registerActor, type Fixture } from './fixtures.js';

describe('GET /classes/:id/students — roster borné', () => {
  let fx: Fixture;
  let otherClassId: string;
  let outsider: { token: string };

  beforeAll(async () => {
    fx = await buildFixture();
    await request(app)
      .post(`/classes/${fx.a.classId}/students`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ studentIds: [fx.a.student.id] });

    const other = await request(app)
      .post('/classes')
      .set(auth(fx.a.schoolAdmin.token))
      .send({
        name: `Classe-roster-${Date.now()}`,
        institutionId: fx.a.institutionId,
        teacherId: fx.a.teacher.id,
      });
    expect(other.status).toBe(201);
    otherClassId = other.body.class.id as string;

    outsider = await registerActor('student', fx.a.institutionId);
    await prisma.strkStudent.update({
      where: { id: outsider.id },
      data: { classId: otherClassId },
    });
  }, 40_000);

  it('la direction voit e-mail et téléphone', async () => {
    const res = await request(app)
      .get(`/classes/${fx.a.classId}/students`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(res.status).toBe(200);
    const self = (res.body.students as { id: string; profile: { email?: string } }[]).find(
      (s) => s.id === fx.a.student.id
    );
    expect(self?.profile.email).toBe(fx.a.student.email);
  });

  it('l’élève de la classe voit les noms, pas les contacts', async () => {
    const res = await request(app)
      .get(`/classes/${fx.a.classId}/students`)
      .set(auth(fx.a.student.token));
    expect(res.status).toBe(200);
    expect(res.body.students.length).toBeGreaterThan(0);
    for (const row of res.body.students as { profile: Record<string, unknown> }[]) {
      expect(row.profile).not.toHaveProperty('email');
      expect(row.profile).not.toHaveProperty('phoneNumber');
      expect(row.profile).toHaveProperty('firstName');
    }
  });

  it('le parent de l’élève voit le roster sans contacts', async () => {
    const res = await request(app)
      .get(`/classes/${fx.a.classId}/students`)
      .set(auth(fx.parentA.token));
    expect(res.status).toBe(200);
    const self = (res.body.students as { id: string; profile: { email?: string } }[]).find(
      (s) => s.id === fx.a.student.id
    );
    expect(self).toBeTruthy();
    expect(self?.profile).not.toHaveProperty('email');
  });

  it('élève / parent d’une autre classe : 404', async () => {
    const student = await request(app)
      .get(`/classes/${otherClassId}/students`)
      .set(auth(fx.a.student.token));
    expect(student.status).toBe(404);

    const parent = await request(app)
      .get(`/classes/${otherClassId}/students`)
      .set(auth(fx.parentA.token));
    expect(parent.status).toBe(404);
  });

  it('un élève de B ne lit pas le roster de A', async () => {
    const res = await request(app)
      .get(`/classes/${fx.a.classId}/students`)
      .set(auth(fx.b.student.token));
    expect([403, 404]).toContain(res.status);
  });
});
