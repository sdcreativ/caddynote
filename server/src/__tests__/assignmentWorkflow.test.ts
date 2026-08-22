import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * §5.6 P1 — recette bout-en-bout devoirs :
 * création → soumission élève → correction enseignant → reminder-check admin.
 * Les suites PED-004/005 couvrent le détail ; celle-ci verrouille le parcours
 * métier minimal attendu par l’audit.
 */
describe('Devoirs — workflow soumission / correction / rappels (§5.6)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it('parcours : créer → soumettre → noter → reminder-check', async () => {
    const create = await request(app).post('/assignments').set(auth(fx.a.teacher.token)).send({
      courseId: fx.a.courseId,
      teacherId: fx.a.teacher.id,
      title: `Recette devoir ${Date.now()}`,
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      description: 'À rendre en ligne',
    });
    expect(create.status).toBe(201);
    const assignmentId = create.body.assignment.id as string;

    const draft = await request(app).post('/assignments/submissions').set(auth(fx.a.student.token)).send({
      assignmentId,
      studentId: fx.a.student.id,
      content: 'Brouillon',
      status: 'draft',
    });
    expect(draft.status).toBe(201);
    expect(draft.body.submission.status).toBe('draft');

    const submit = await request(app).post('/assignments/submissions').set(auth(fx.a.student.token)).send({
      assignmentId,
      studentId: fx.a.student.id,
      content: 'Copie finale',
      status: 'submitted',
    });
    expect(submit.status).toBe(201);
    expect(['submitted', 'late']).toContain(submit.body.submission.status);
    const submissionId = submit.body.submission.id as string;

    const selfGrade = await request(app)
      .patch(`/assignments/submissions/${submissionId}/grade`)
      .set(auth(fx.a.student.token))
      .send({ grade: 20 });
    expect(selfGrade.status).toBe(403);

    const grade = await request(app)
      .patch(`/assignments/submissions/${submissionId}/grade`)
      .set(auth(fx.a.teacher.token))
      .send({ grade: 14.5, feedback: 'Bien structuré' });
    expect(grade.status).toBe(200);
    expect(grade.body.submission.status).toBe('graded');
    expect(Number(grade.body.submission.grade)).toBe(14.5);

    const listTeacher = await request(app)
      .get(`/assignments/${assignmentId}/submissions`)
      .set(auth(fx.a.teacher.token));
    expect(listTeacher.status).toBe(200);
    const graded = listTeacher.body.submissions.find((s: { id: string }) => s.id === submissionId);
    expect(graded?.status).toBe('graded');

    const forbiddenCheck = await request(app)
      .post('/assignments/reminder-check')
      .set(auth(fx.a.schoolAdmin.token));
    expect(forbiddenCheck.status).toBe(403);

    const check = await request(app).post('/assignments/reminder-check').set(auth(fx.globalAdmin.token));
    expect(check.status).toBe(200);
    expect(check.body).toHaveProperty('checked');
  });

  it('une soumission après échéance est marquée late', async () => {
    const create = await request(app).post('/assignments').set(auth(fx.a.teacher.token)).send({
      courseId: fx.a.courseId,
      teacherId: fx.a.teacher.id,
      title: `Devoir retard ${Date.now()}`,
      dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(create.status).toBe(201);

    const submit = await request(app).post('/assignments/submissions').set(auth(fx.a.student.token)).send({
      assignmentId: create.body.assignment.id,
      studentId: fx.a.student.id,
      content: 'En retard',
    });
    expect(submit.status).toBe(201);
    expect(submit.body.submission.status).toBe('late');
  });
});
