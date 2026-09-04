import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { auth, buildFixture, type Fixture } from './fixtures.js';

describe('GET /assignments/:id — lecture bornée', () => {
  let fx: Fixture;
  let ownAssignmentId: string;
  let otherAssignmentId: string;

  beforeAll(async () => {
    fx = await buildFixture();

    const own = await request(app).post('/assignments').set(auth(fx.a.teacher.token)).send({
      courseId: fx.a.courseId,
      teacherId: fx.a.teacher.id,
      title: `Devoir-inscrit-${Date.now()}`,
      dueDate: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(own.status).toBe(201);
    ownAssignmentId = own.body.assignment.id as string;

    const otherClass = await request(app)
      .post('/classes')
      .set(auth(fx.a.schoolAdmin.token))
      .send({
        name: `Classe-devoir-${Date.now()}`,
        institutionId: fx.a.institutionId,
        teacherId: fx.a.teacher.id,
      });
    expect(otherClass.status).toBe(201);

    const otherCourse = await request(app)
      .post('/courses')
      .set(auth(fx.a.schoolAdmin.token))
      .send({
        name: `Cours-devoir-${Date.now()}`,
        institutionId: fx.a.institutionId,
        teacherId: fx.a.teacher.id,
        classId: otherClass.body.class.id,
        subjectId: fx.a.subjectId,
        coefficient: 1,
      });
    expect(otherCourse.status).toBe(201);

    const other = await request(app).post('/assignments').set(auth(fx.a.teacher.token)).send({
      courseId: otherCourse.body.course.id,
      teacherId: fx.a.teacher.id,
      title: `Devoir-autre-classe-${Date.now()}`,
      dueDate: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(other.status).toBe(201);
    otherAssignmentId = other.body.assignment.id as string;
  }, 40_000);

  it('élève et parent lisent le devoir de leur cours', async () => {
    const student = await request(app).get(`/assignments/${ownAssignmentId}`).set(auth(fx.a.student.token));
    expect(student.status).toBe(200);
    expect(student.body.assignment.id).toBe(ownAssignmentId);

    const parent = await request(app).get(`/assignments/${ownAssignmentId}`).set(auth(fx.parentA.token));
    expect(parent.status).toBe(200);
  });

  it('élève et parent ne lisent pas le devoir d’une autre classe', async () => {
    const student = await request(app).get(`/assignments/${otherAssignmentId}`).set(auth(fx.a.student.token));
    expect(student.status).toBe(403);

    const parent = await request(app).get(`/assignments/${otherAssignmentId}`).set(auth(fx.parentA.token));
    expect(parent.status).toBe(403);
  });

  it('l’enseignant et la direction voient les deux devoirs du tenant', async () => {
    const teacher = await request(app).get(`/assignments/${otherAssignmentId}`).set(auth(fx.a.teacher.token));
    expect(teacher.status).toBe(200);

    const direction = await request(app)
      .get(`/assignments/${otherAssignmentId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(direction.status).toBe(200);
  });

  it('un enseignant de B ne lit pas le devoir de A', async () => {
    const res = await request(app).get(`/assignments/${ownAssignmentId}`).set(auth(fx.b.teacher.token));
    expect(res.status).toBe(403);
  });
});
