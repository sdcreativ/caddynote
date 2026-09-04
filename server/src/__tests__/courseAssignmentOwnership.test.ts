import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { auth, buildFixture, registerActor, type Actor, type Fixture } from './fixtures.js';

describe('PATCH cours / PATCH·DELETE devoirs — titulaire ou direction', () => {
  let fx: Fixture;
  let peer: Actor;
  let assignmentId: string;
  let destCourseId: string;

  beforeAll(async () => {
    fx = await buildFixture();
    peer = await registerActor('teacher', fx.a.institutionId);

    const destCourse = await request(app)
      .post('/courses')
      .set(auth(fx.a.schoolAdmin.token))
      .send({
        name: `Cours-dest-${Date.now()}`,
        institutionId: fx.a.institutionId,
        teacherId: fx.a.teacher.id,
        classId: fx.a.classId,
        subjectId: fx.a.subjectId,
        coefficient: 1,
      });
    expect(destCourse.status).toBe(201);
    destCourseId = destCourse.body.course.id as string;

    const created = await request(app).post('/assignments').set(auth(fx.a.teacher.token)).send({
      courseId: fx.a.courseId,
      teacherId: fx.a.teacher.id,
      title: `Devoir-owner-${Date.now()}`,
      dueDate: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(created.status).toBe(201);
    assignmentId = created.body.assignment.id as string;
  }, 40_000);

  it('un enseignant pair ne PATCH pas le cours d’un collègue', async () => {
    const res = await request(app)
      .patch(`/courses/${fx.a.courseId}`)
      .set(auth(peer.token))
      .send({ name: 'Piraté' });
    expect(res.status).toBe(403);
  });

  it('le titulaire et la direction PATCH le cours', async () => {
    const owner = await request(app)
      .patch(`/courses/${fx.a.courseId}`)
      .set(auth(fx.a.teacher.token))
      .send({ name: `Cours-ok-${Date.now()}` });
    expect(owner.status).toBe(200);

    const direction = await request(app)
      .patch(`/courses/${fx.a.courseId}`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ name: `Cours-dir-${Date.now()}` });
    expect(direction.status).toBe(200);
  });

  it('un enseignant pair ne PATCH ni DELETE le devoir d’un collègue', async () => {
    const patch = await request(app)
      .patch(`/assignments/${assignmentId}`)
      .set(auth(peer.token))
      .send({ title: 'Piraté' });
    expect(patch.status).toBe(403);

    const del = await request(app).delete(`/assignments/${assignmentId}`).set(auth(peer.token));
    expect(del.status).toBe(403);
  });

  it('un enseignant pair ne déplace pas le devoir vers un autre cours', async () => {
    const res = await request(app)
      .patch(`/assignments/${assignmentId}`)
      .set(auth(peer.token))
      .send({ courseId: destCourseId });
    expect(res.status).toBe(403);
  });

  it('le titulaire PATCH le devoir ; la direction le supprime', async () => {
    const owner = await request(app)
      .patch(`/assignments/${assignmentId}`)
      .set(auth(fx.a.teacher.token))
      .send({ title: `Devoir-ok-${Date.now()}`, courseId: destCourseId });
    expect(owner.status).toBe(200);
    expect(owner.body.assignment.courseId).toBe(destCourseId);

    const direction = await request(app)
      .delete(`/assignments/${assignmentId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(direction.status).toBe(200);
  });

  it('un enseignant de B reçoit 404 sur PATCH/DELETE du devoir de A', async () => {
    const other = await request(app).post('/assignments').set(auth(fx.a.teacher.token)).send({
      courseId: fx.a.courseId,
      teacherId: fx.a.teacher.id,
      title: `Devoir-tenant-${Date.now()}`,
      dueDate: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(other.status).toBe(201);
    const id = other.body.assignment.id as string;

    const patch = await request(app)
      .patch(`/assignments/${id}`)
      .set(auth(fx.b.teacher.token))
      .send({ title: 'Piraté' });
    expect(patch.status).toBe(404);

    const del = await request(app).delete(`/assignments/${id}`).set(auth(fx.b.teacher.token));
    expect(del.status).toBe(404);
  });
});
