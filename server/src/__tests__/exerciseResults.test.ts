import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

describe('GET /exercises/:id/attempts — résultats enseignant', () => {
  let fx: Fixture;
  let exerciseId: string;

  beforeAll(async () => {
    fx = await buildFixture();
    const created = await request(app)
      .post('/exercises')
      .set(auth(fx.a.teacher.token))
      .send({ title: 'Quiz résultats', isPublished: true, points: 10 });
    expect(created.status).toBe(201);
    exerciseId = created.body.exercise.id;

    await prisma.strkExerciseAttempt.create({
      data: {
        exerciseId,
        studentId: fx.a.student.id,
        attemptNumber: 1,
        status: 'submitted',
        score: 8,
        maxScore: 10,
        submittedAt: new Date(),
        answers: {},
      },
    });
  });

  it('l’enseignant voit toutes les tentatives avec le profil élève', async () => {
    const res = await request(app)
      .get(`/exercises/${exerciseId}/attempts`)
      .set(auth(fx.a.teacher.token));
    expect(res.status).toBe(200);
    expect(res.body.attempts.length).toBeGreaterThanOrEqual(1);
    const attempt = res.body.attempts.find((a: { studentId: string }) => a.studentId === fx.a.student.id);
    expect(attempt).toBeTruthy();
    expect(attempt.student?.id).toBe(fx.a.student.id);
  });

  it('l’élève ne voit que ses propres tentatives (pas celles d’autrui)', async () => {
    const res = await request(app)
      .get(`/exercises/${exerciseId}/attempts`)
      .set(auth(fx.a.student.token));
    expect(res.status).toBe(200);
    expect(res.body.attempts.every((a: { studentId: string }) => a.studentId === fx.a.student.id)).toBe(true);
  });

  it('refuse les tentatives d’un exercice d’un autre établissement', async () => {
    const res = await request(app)
      .get(`/exercises/${exerciseId}/attempts`)
      .set(auth(fx.b.teacher.token));
    expect(res.status).toBe(403);
  });
});
