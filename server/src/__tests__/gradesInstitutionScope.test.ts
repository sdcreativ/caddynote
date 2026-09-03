import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

describe('GET /grades?scope=institution (liste Direction)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it('renvoie les notes de l’établissement pour school_admin', async () => {
    await prisma.strkGrade.create({
      data: {
        studentId: fx.a.student.id,
        courseId: fx.a.courseId,
        teacherId: fx.a.teacher.id,
        gradeValue: 15,
        maxGrade: 20,
        gradeType: 'evaluation',
        title: 'Note établissement',
        date: new Date('2026-09-01'),
        periodId: fx.a.periodId,
        status: 'published',
      },
    });

    const res = await request(app)
      .get('/grades?scope=institution')
      .set(auth(fx.a.schoolAdmin.token));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.grades)).toBe(true);
    expect(res.body.grades.some((g: { title: string }) => g.title === 'Note établissement')).toBe(true);
  });

  it('refuse un enseignant hors direction/head_teacher', async () => {
    const res = await request(app)
      .get('/grades?scope=institution')
      .set(auth(fx.a.teacher.token));

    expect(res.status).toBe(403);
  });

  it('refuse le scope institution d’un autre établissement (admin global sans institutionId)', async () => {
    const res = await request(app)
      .get('/grades?scope=institution')
      .set(auth(fx.globalAdmin.token));

    // admin global sans institution JWT ni query → 400 ou 403
    expect([400, 403]).toContain(res.status);
  });
});
