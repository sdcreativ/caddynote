import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { auth, buildFixture, type Fixture } from './fixtures.js';

describe('GET /activity — fil établissement réservé au personnel', () => {
  let fx: Fixture;
  let activityId: string;

  beforeAll(async () => {
    fx = await buildFixture();
    const created = await request(app)
      .post('/activity')
      .set(auth(fx.a.schoolAdmin.token))
      .send({
        type: 'login',
        institutionId: fx.a.institutionId,
        description: 'Connexion direction',
      });
    expect(created.status).toBe(201);
    activityId = created.body.activity.id as string;
  }, 30_000);

  it('la direction et l’enseignant lisent le fil', async () => {
    const direction = await request(app)
      .get(`/activity?institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(direction.status).toBe(200);
    expect((direction.body.activities as { id: string }[]).some((a) => a.id === activityId)).toBe(true);

    const teacher = await request(app)
      .get(`/activity?institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.teacher.token));
    expect(teacher.status).toBe(200);
  });

  it('élève et parent sont refusés', async () => {
    const student = await request(app)
      .get(`/activity?institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.student.token));
    expect(student.status).toBe(403);

    const parent = await request(app)
      .get(`/activity?institutionId=${fx.a.institutionId}`)
      .set(auth(fx.parentA.token));
    expect(parent.status).toBe(403);
  });

  it('l’élève peut encore lire son propre journal', async () => {
    const res = await request(app)
      .get(`/activity/by-user/${fx.a.student.id}`)
      .set(auth(fx.a.student.token));
    expect(res.status).toBe(200);
  });

  it('un staff de B ne lit pas le fil de A', async () => {
    const res = await request(app)
      .get(`/activity?institutionId=${fx.a.institutionId}`)
      .set(auth(fx.b.schoolAdmin.token));
    expect(res.status).toBe(403);
  });
});
