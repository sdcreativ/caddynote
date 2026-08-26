import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

describe('GET /absences/upcoming-calls', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it('refuse un rôle non enseignant', async () => {
    const res = await request(app).get('/absences/upcoming-calls').set(auth(fx.a.student.token));
    expect(res.status).toBe(403);
  });

  it('renvoie une liste (éventuellement vide) pour un enseignant', async () => {
    const res = await request(app).get('/absences/upcoming-calls').set(auth(fx.a.teacher.token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.calls)).toBe(true);
    expect(res.body.withinMinutes).toBe(10);
  });

  it('signale un créneau dans la fenêtre si l’emploi du temps matche l’heure serveur', async () => {
    const now = new Date();
    const in8 = new Date(now.getTime() + 8 * 60_000);
    const startTime = `${String(in8.getHours()).padStart(2, '0')}:${String(in8.getMinutes()).padStart(2, '0')}`;

    await prisma.strkSchedule.create({
      data: {
        courseId: fx.a.courseId,
        classId: fx.a.classId,
        institutionId: fx.a.institutionId,
        teacherId: fx.a.teacher.id,
        dayOfWeek: now.getDay(),
        startTime,
        endTime: '23:59',
        isActive: true,
      },
    });

    const res = await request(app)
      .get('/absences/upcoming-calls?withinMinutes=15')
      .set(auth(fx.a.teacher.token));
    expect(res.status).toBe(200);
    expect(res.body.calls.some((c: { courseId: string }) => c.courseId === fx.a.courseId)).toBe(true);
  });

  it('n’inclut pas un cours déjà appelé aujourd’hui', async () => {
    const now = new Date();
    const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const created = await request(app).post('/absences').set(auth(fx.a.teacher.token)).send({
      studentId: fx.a.student.id,
      institutionId: fx.a.institutionId,
      courseId: fx.a.courseId,
      type: 'absence',
      date: ymd,
      duration: 60,
    });
    expect([200, 201]).toContain(created.status);
    expect(created.body.absence?.courseId).toBe(fx.a.courseId);

    const res = await request(app)
      .get('/absences/upcoming-calls?withinMinutes=60')
      .set(auth(fx.a.teacher.token));
    expect(res.status).toBe(200);
    expect(res.body.calls.every((c: { courseId: string }) => c.courseId !== fx.a.courseId)).toBe(true);
  });
});
