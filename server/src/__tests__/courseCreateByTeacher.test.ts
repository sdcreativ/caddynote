import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

describe('POST /courses — réservé direction / secrétariat', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it('refuse qu’un enseignant crée un cours (403)', async () => {
    const res = await request(app)
      .post('/courses')
      .set(auth(fx.a.teacher.token))
      .send({
        name: 'Cours enseignant interdit',
        institutionId: fx.a.institutionId,
        teacherId: fx.a.teacher.id,
      });

    expect(res.status).toBe(403);
  });

  it('refuse un élève (403)', async () => {
    const res = await request(app)
      .post('/courses')
      .set(auth(fx.a.student.token))
      .send({
        name: 'Cours élève',
        institutionId: fx.a.institutionId,
        teacherId: fx.a.teacher.id,
      });

    expect(res.status).toBe(403);
  });

  it('autorise school_admin à créer un cours pour un enseignant', async () => {
    const res = await request(app)
      .post('/courses')
      .set(auth(fx.a.schoolAdmin.token))
      .send({
        name: 'Cours assigné par la direction',
        institutionId: fx.a.institutionId,
        teacherId: fx.a.teacher.id,
      });

    expect(res.status).toBe(201);
    expect(res.body.course.teacherId).toBe(fx.a.teacher.id);
  });
});

describe('GET /schedules?teacherId — planning héritant du cours', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it('renvoie les créneaux liés via course.teacherId même sans schedule.teacherId', async () => {
    const created = await request(app)
      .post('/schedules')
      .set(auth(fx.a.schoolAdmin.token))
      .send({
        courseId: fx.a.courseId,
        classId: fx.a.classId,
        institutionId: fx.a.institutionId,
        // teacherId volontairement omis — hérité du cours
        dayOfWeek: 3,
        startTime: '14:00',
        endTime: '15:00',
        room: 'B12',
      });
    expect(created.status).toBe(201);
    expect(created.body.schedule.teacherId).toBe(fx.a.teacher.id);

    const res = await request(app)
      .get(`/schedules?teacherId=${fx.a.teacher.id}`)
      .set(auth(fx.a.teacher.token));
    expect(res.status).toBe(200);
    expect(res.body.schedules.map((s: { id: string }) => s.id)).toContain(created.body.schedule.id);
  });
});
