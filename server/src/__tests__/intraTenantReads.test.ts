import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { auth, buildFixture, registerActor, type Fixture } from './fixtures.js';

describe('Lectures intra-tenant — notes / absences / cours', () => {
  let fx: Fixture;
  let peerId: string;
  let otherCourseId: string;

  beforeAll(async () => {
    fx = await buildFixture();
    const peer = await registerActor('student', fx.a.institutionId);
    peerId = peer.id;
    await prisma.strkStudent.update({ where: { id: peerId }, data: { classId: fx.a.classId } });

    const enroll = await request(app)
      .post(`/classes/${fx.a.classId}/students`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ studentIds: [fx.a.student.id, peerId] });
    expect([200, 201]).toContain(enroll.status);

    const otherClass = await request(app)
      .post('/classes')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ name: `Classe-autre-${Date.now()}`, institutionId: fx.a.institutionId, teacherId: fx.a.teacher.id });
    expect(otherClass.status).toBe(201);

    const otherCourse = await request(app)
      .post('/courses')
      .set(auth(fx.a.schoolAdmin.token))
      .send({
        name: `Cours-secret-${Date.now()}`,
        institutionId: fx.a.institutionId,
        teacherId: fx.a.teacher.id,
        classId: otherClass.body.class.id,
        subjectId: fx.a.subjectId,
        coefficient: 1,
      });
    expect(otherCourse.status).toBe(201);
    otherCourseId = otherCourse.body.course.id as string;

    const own = await request(app).post('/grades').set(auth(fx.a.teacher.token)).send({
      studentId: fx.a.student.id,
      courseId: fx.a.courseId,
      teacherId: fx.a.teacher.id,
      gradeValue: 11,
      title: 'Note-eleve-A',
      periodId: fx.a.periodId,
    });
    const peerGrade = await request(app).post('/grades').set(auth(fx.a.teacher.token)).send({
      studentId: peerId,
      courseId: fx.a.courseId,
      teacherId: fx.a.teacher.id,
      gradeValue: 18,
      title: 'Note-camarade',
      periodId: fx.a.periodId,
    });
    expect(own.status).toBe(201);
    expect(peerGrade.status).toBe(201);
    const published = await request(app)
      .post('/grades/publish')
      .set(auth(fx.a.teacher.token))
      .send({ courseId: fx.a.courseId, periodId: fx.a.periodId });
    expect(published.status).toBe(200);

    for (const studentId of [fx.a.student.id, peerId]) {
      const created = await request(app).post('/absences').set(auth(fx.a.teacher.token)).send({
        studentId,
        institutionId: fx.a.institutionId,
        courseId: fx.a.courseId,
        type: 'absence',
        date: '2026-03-04',
        duration: 60,
      });
      expect(created.status).toBe(201);
    }
  }, 40_000);

  it('GET /grades?courseId= : élève et parent ne voient que leurs notes', async () => {
    const student = await request(app)
      .get(`/grades?courseId=${fx.a.courseId}`)
      .set(auth(fx.a.student.token));
    expect(student.status).toBe(200);
    const studentTitles = (student.body.grades as { title: string; studentId: string }[]).map((g) => g.title);
    expect(studentTitles).toContain('Note-eleve-A');
    expect(studentTitles).not.toContain('Note-camarade');

    const parent = await request(app)
      .get(`/grades?courseId=${fx.a.courseId}`)
      .set(auth(fx.parentA.token));
    expect(parent.status).toBe(200);
    const parentTitles = (parent.body.grades as { title: string }[]).map((g) => g.title);
    expect(parentTitles).toContain('Note-eleve-A');
    expect(parentTitles).not.toContain('Note-camarade');
  });

  it('GET /grades?courseId= : l’enseignant voit tout le cours', async () => {
    const res = await request(app)
      .get(`/grades?courseId=${fx.a.courseId}`)
      .set(auth(fx.a.teacher.token));
    expect(res.status).toBe(200);
    const titles = (res.body.grades as { title: string }[]).map((g) => g.title);
    expect(titles).toEqual(expect.arrayContaining(['Note-eleve-A', 'Note-camarade']));
  });

  it('GET /absences?courseId= et ?classId= : élève / parent sans les camarades', async () => {
    const byCourse = await request(app)
      .get(`/absences?courseId=${fx.a.courseId}`)
      .set(auth(fx.a.student.token));
    expect(byCourse.status).toBe(200);
    const courseIds = (byCourse.body.absences as { studentId: string }[]).map((a) => a.studentId);
    expect(courseIds).toContain(fx.a.student.id);
    expect(courseIds).not.toContain(peerId);

    const byClass = await request(app)
      .get(`/absences?classId=${fx.a.classId}`)
      .set(auth(fx.parentA.token));
    expect(byClass.status).toBe(200);
    const classIds = (byClass.body.absences as { studentId: string }[]).map((a) => a.studentId);
    expect(classIds).toContain(fx.a.student.id);
    expect(classIds).not.toContain(peerId);
  });

  it('GET /absences?courseId= : le personnel voit les deux absences', async () => {
    const res = await request(app)
      .get(`/absences?courseId=${fx.a.courseId}`)
      .set(auth(fx.a.teacher.token));
    expect(res.status).toBe(200);
    const ids = (res.body.absences as { studentId: string }[]).map((a) => a.studentId);
    expect(ids).toEqual(expect.arrayContaining([fx.a.student.id, peerId]));
  });

  it('GET /courses?institutionId= : élève / parent sans le cours d’une autre classe', async () => {
    const student = await request(app)
      .get(`/courses?institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.student.token));
    expect(student.status).toBe(200);
    const studentIds = (student.body.courses as { id: string }[]).map((c) => c.id);
    expect(studentIds).toContain(fx.a.courseId);
    expect(studentIds).not.toContain(otherCourseId);

    const parent = await request(app)
      .get(`/courses?institutionId=${fx.a.institutionId}`)
      .set(auth(fx.parentA.token));
    expect(parent.status).toBe(200);
    const parentIds = (parent.body.courses as { id: string }[]).map((c) => c.id);
    expect(parentIds).toContain(fx.a.courseId);
    expect(parentIds).not.toContain(otherCourseId);
  });

  it('GET /courses?institutionId= : la direction voit tous les cours', async () => {
    const res = await request(app)
      .get(`/courses?institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(res.status).toBe(200);
    const ids = (res.body.courses as { id: string }[]).map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining([fx.a.courseId, otherCourseId]));
  });

  it('GET /courses?classId= d’une autre classe est refusé à l’élève', async () => {
    const otherClass = await prisma.strkCourse.findUnique({
      where: { id: otherCourseId },
      select: { classId: true },
    });
    const res = await request(app)
      .get(`/courses?classId=${otherClass!.classId}`)
      .set(auth(fx.a.student.token));
    expect(res.status).toBe(403);
  });

  it('GET /courses/:id : élève et parent voient leur cours, pas celui d’une autre classe', async () => {
    const own = await request(app).get(`/courses/${fx.a.courseId}`).set(auth(fx.a.student.token));
    expect(own.status).toBe(200);
    expect(own.body.course.id).toBe(fx.a.courseId);

    const parent = await request(app).get(`/courses/${fx.a.courseId}`).set(auth(fx.parentA.token));
    expect(parent.status).toBe(200);

    const other = await request(app).get(`/courses/${otherCourseId}`).set(auth(fx.a.student.token));
    expect(other.status).toBe(403);

    const parentOther = await request(app).get(`/courses/${otherCourseId}`).set(auth(fx.parentA.token));
    expect(parentOther.status).toBe(403);
  });

  it('GET /courses/:id/materials et /lessons : même scope que le cours', async () => {
    const ownMat = await request(app)
      .get(`/courses/${fx.a.courseId}/materials`)
      .set(auth(fx.a.student.token));
    expect(ownMat.status).toBe(200);

    const otherMat = await request(app)
      .get(`/courses/${otherCourseId}/materials`)
      .set(auth(fx.a.student.token));
    expect(otherMat.status).toBe(403);

    const otherLessons = await request(app)
      .get(`/courses/${otherCourseId}/lessons`)
      .set(auth(fx.a.student.token));
    expect(otherLessons.status).toBe(403);

    const teacherOther = await request(app)
      .get(`/courses/${otherCourseId}/lessons`)
      .set(auth(fx.a.teacher.token));
    expect(teacherOther.status).toBe(200);
  });
});
