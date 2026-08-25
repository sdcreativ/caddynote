import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

describe('GET /absences?classId — historique par classe', () => {
  let fx: Fixture;
  let absenceId: string;

  beforeAll(async () => {
    fx = await buildFixture();

    // Inscription canonique (StrkClassStudent) pour l’effectif de la classe.
    const enroll = await request(app)
      .post(`/classes/${fx.a.classId}/students`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ studentIds: [fx.a.student.id] });
    expect([200, 201]).toContain(enroll.status);

    const created = await request(app).post('/absences').set(auth(fx.a.teacher.token)).send({
      studentId: fx.a.student.id,
      institutionId: fx.a.institutionId,
      type: 'absence',
      date: new Date().toISOString().split('T')[0],
      duration: 60,
    });
    expect(created.status).toBe(201);
    absenceId = created.body.absence.id as string;
  }, 30000);

  it('liste les absences des élèves de la classe pour le personnel du même établissement', async () => {
    const res = await request(app)
      .get(`/absences?classId=${fx.a.classId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.absences)).toBe(true);
    expect(res.body.absences.some((a: { id: string }) => a.id === absenceId)).toBe(true);
  });

  it('refuse l’accès depuis un autre établissement (ORG-004)', async () => {
    const res = await request(app)
      .get(`/absences?classId=${fx.a.classId}`)
      .set(auth(fx.b.schoolAdmin.token));
    expect(res.status).toBe(403);
  });
});
