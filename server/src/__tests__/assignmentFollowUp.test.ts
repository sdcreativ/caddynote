import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { resolveFollowUpStatus } from '../lib/assignmentFollowUp.js';
import { buildFixture, registerActor, auth, type Fixture } from './fixtures.js';

/**
 * PED-004 — suivi de remise. GET /assignments/:id/follow-up croise le
 * roster de la classe avec les copies : un élève sans soumission apparaît
 * (non remis / manquant), un brouillon ne compte pas comme rendu.
 */
describe('Suivi des remises (PED-004)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  const addClassmate = async () => {
    const actor = await registerActor('student', fx.a.institutionId);
    await prisma.strkStudent.update({ where: { id: actor.id }, data: { classId: fx.a.classId } });
    return actor;
  };

  const createAssignment = async (dueDate: Date) => {
    const assignment = await prisma.strkAssignment.create({
      data: {
        courseId: fx.a.courseId,
        teacherId: fx.a.teacher.id,
        title: `Suivi ${Date.now()}-${Math.random().toString(36).slice(2)}`,
        dueDate,
      },
    });
    return assignment.id;
  };

  describe('resolveFollowUpStatus', () => {
    const due = new Date('2026-06-01T12:00:00Z');

    it('sans copie : non remis avant l’échéance, manquant après', () => {
      expect(resolveFollowUpStatus({ dueDate: due, now: new Date('2026-05-31T12:00:00Z'), submission: null })).toBe(
        'not_submitted'
      );
      expect(resolveFollowUpStatus({ dueDate: due, now: new Date('2026-06-02T12:00:00Z'), submission: null })).toBe(
        'missing'
      );
    });

    it('un brouillon ne compte pas comme rendu', () => {
      expect(
        resolveFollowUpStatus({
          dueDate: due,
          now: new Date('2026-05-31T12:00:00Z'),
          submission: { status: 'draft', submittedAt: null, grade: null },
        })
      ).toBe('draft');
      expect(
        resolveFollowUpStatus({
          dueDate: due,
          now: new Date('2026-06-02T12:00:00Z'),
          submission: { status: 'draft', submittedAt: null, grade: null },
        })
      ).toBe('missing');
    });

    it('copie à l’heure, en retard, ou déjà notée', () => {
      expect(
        resolveFollowUpStatus({
          dueDate: due,
          now: new Date('2026-06-02T12:00:00Z'),
          submission: { status: 'submitted', submittedAt: new Date('2026-05-30T12:00:00Z'), grade: null },
        })
      ).toBe('submitted');
      expect(
        resolveFollowUpStatus({
          dueDate: due,
          now: new Date('2026-06-02T12:00:00Z'),
          submission: { status: 'late', submittedAt: new Date('2026-06-02T08:00:00Z'), grade: null },
        })
      ).toBe('late');
      expect(
        resolveFollowUpStatus({
          dueDate: due,
          now: new Date('2026-06-02T12:00:00Z'),
          submission: { status: 'graded', submittedAt: new Date('2026-05-30T12:00:00Z'), grade: 14 },
        })
      ).toBe('graded');
    });
  });

  it('liste toute la classe : rendu, retard, brouillon, manquant', async () => {
    const onTime = fx.a.student;
    const late = await addClassmate();
    const draft = await addClassmate();
    const missing = await addClassmate();
    const assignmentId = await createAssignment(new Date(Date.now() - 24 * 60 * 60 * 1000));

    await prisma.strkSubmission.create({
      data: {
        assignmentId,
        studentId: onTime.id,
        content: 'Rendu à l’heure',
        status: 'submitted',
        submittedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
    });
    await request(app)
      .post('/assignments/submissions')
      .set(auth(late.token))
      .send({ assignmentId, studentId: late.id, content: 'En retard' });
    await prisma.strkSubmission.create({
      data: {
        assignmentId,
        studentId: draft.id,
        content: 'Brouillon',
        status: 'draft',
        submittedAt: null,
      },
    });

    const res = await request(app).get(`/assignments/${assignmentId}/follow-up`).set(auth(fx.a.teacher.token));
    expect(res.status).toBe(200);
    expect(res.body.summary.roster).toBeGreaterThanOrEqual(4);
    expect(res.body.summary.submitted).toBe(2);
    expect(res.body.summary.late).toBe(1);
    expect(res.body.summary.missing).toBeGreaterThanOrEqual(2);
    expect(res.body.summary.toGrade).toBe(2);
    expect(res.body.summary.graded).toBe(0);

    const byId = new Map(res.body.students.map((s: { studentId: string }) => [s.studentId, s]));
    expect(byId.get(onTime.id)).toMatchObject({ followUpStatus: 'submitted', late: false });
    expect(byId.get(late.id)).toMatchObject({ followUpStatus: 'late', late: true });
    expect(byId.get(draft.id)).toMatchObject({ followUpStatus: 'missing' });
    expect(byId.get(missing.id)).toMatchObject({ followUpStatus: 'missing', submissionId: null });
  });

  it('n’inclut pas un élève d’une autre classe du même établissement', async () => {
    const outsider = await registerActor('student', fx.a.institutionId);
    const assignmentId = await createAssignment(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const res = await request(app).get(`/assignments/${assignmentId}/follow-up`).set(auth(fx.a.teacher.token));
    expect(res.status).toBe(200);
    const ids = res.body.students.map((s: { studentId: string }) => s.studentId);
    expect(ids).toContain(fx.a.student.id);
    expect(ids).not.toContain(outsider.id);
  });

  it('refuse l’établissement B et l’élève (ORG-004)', async () => {
    const assignmentId = await createAssignment(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const asB = await request(app).get(`/assignments/${assignmentId}/follow-up`).set(auth(fx.b.teacher.token));
    expect(asB.status).toBe(403);

    const asStudent = await request(app).get(`/assignments/${assignmentId}/follow-up`).set(auth(fx.a.student.token));
    expect(asStudent.status).toBe(403);
  });

  it('un devoir inconnu ne révèle pas son existence (403)', async () => {
    const res = await request(app)
      .get('/assignments/00000000-0000-4000-8000-000000000000/follow-up')
      .set(auth(fx.a.teacher.token));
    expect(res.status).toBe(403);
  });
});
