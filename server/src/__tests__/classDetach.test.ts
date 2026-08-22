import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

describe('Classes — suppression / détachement cohérent (§5.2)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it('DELETE /classes/:id clôt les inscriptions, détache les élèves et le titulaire', async () => {
    const create = await request(app)
      .post('/classes')
      .set(auth(fx.a.schoolAdmin.token))
      .send({
        name: `Classe detach ${Date.now()}`,
        institutionId: fx.a.institutionId,
        teacherId: fx.a.teacher.id,
      });
    expect(create.status).toBe(201);
    const classId = create.body.class.id as string;

    const assign = await request(app)
      .post(`/classes/${classId}/students`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ studentIds: [fx.a.student.id] });
    expect(assign.status).toBe(201);

    const before = await prisma.strkStudent.findUnique({ where: { id: fx.a.student.id } });
    expect(before?.classId).toBe(classId);

    const del = await request(app).delete(`/classes/${classId}`).set(auth(fx.a.schoolAdmin.token));
    expect(del.status).toBe(200);

    const klass = await prisma.strkClass.findUnique({ where: { id: classId } });
    expect(klass?.isActive).toBe(false);
    expect(klass?.teacherId).toBeNull();

    const student = await prisma.strkStudent.findUnique({ where: { id: fx.a.student.id } });
    expect(student?.classId).toBeNull();

    const activeEnrollments = await prisma.strkClassStudent.count({
      where: { classId, isActive: true },
    });
    expect(activeEnrollments).toBe(0);

    const legacy = await prisma.strkStudentClass.count({ where: { classId } });
    expect(legacy).toBe(0);
  });

  it('PATCH teacherId null détache le titulaire ; DELETE subject lié renvoie 409', async () => {
    const create = await request(app)
      .post('/classes')
      .set(auth(fx.a.schoolAdmin.token))
      .send({
        name: `Classe teacher ${Date.now()}`,
        institutionId: fx.a.institutionId,
        teacherId: fx.a.teacher.id,
      });
    const classId = create.body.class.id as string;

    const unassign = await request(app)
      .patch(`/classes/${classId}`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ teacherId: null });
    expect(unassign.status).toBe(200);
    expect(unassign.body.class.teacherId).toBeNull();

    const subject = await request(app)
      .post('/subjects')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ name: `Matière ${Date.now()}`, institutionId: fx.a.institutionId });
    expect(subject.status).toBe(201);
    const subjectId = subject.body.subject.id as string;

    const link = await request(app)
      .post('/subjects/class-subjects')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ classId, subjectId });
    expect(link.status).toBe(201);

    const delSubject = await request(app)
      .delete(`/subjects/${subjectId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(delSubject.status).toBe(409);
    expect(delSubject.body.code).toBe('subject_in_use');

    await request(app)
      .delete(`/subjects/class-subjects/${classId}/${subjectId}`)
      .set(auth(fx.a.schoolAdmin.token));
    const delOk = await request(app).delete(`/subjects/${subjectId}`).set(auth(fx.a.schoolAdmin.token));
    expect(delOk.status).toBe(200);
  });
});
