import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * Création d’un cours avec jour + heure → créneau calendrier visible
 * direction / enseignant / élève / parent.
 */
describe('POST /courses — publication automatique au calendrier', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it('crée le cours et un schedule ; visible par tous les rôles concernés', async () => {
    const created = await request(app)
      .post('/courses')
      .set(auth(fx.a.schoolAdmin.token))
      .send({
        name: 'Physique auto-EDT',
        institutionId: fx.a.institutionId,
        teacherId: fx.a.teacher.id,
        classId: fx.a.classId,
        scheduleDay: 'Jeudi',
        scheduleTime: '15:00',
        duration: 60,
        room: 'Lab-1',
      });

    expect(created.status).toBe(201);
    expect(created.body.course?.id).toBeTruthy();
    expect(created.body.schedule?.id).toBeTruthy();
    expect(created.body.schedule.dayOfWeek).toBe(4);
    expect(created.body.schedule.startTime).toBe('15:00');
    expect(created.body.schedule.endTime).toBe('16:00');
    expect(created.body.schedule.teacherId).toBe(fx.a.teacher.id);
    expect(created.body.schedule.classId).toBe(fx.a.classId);

    const scheduleId = created.body.schedule.id as string;

    const byInst = await request(app)
      .get(`/schedules?institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(byInst.status).toBe(200);
    expect(byInst.body.schedules.some((s: { id: string }) => s.id === scheduleId)).toBe(true);

    const byTeacher = await request(app)
      .get(`/schedules?teacherId=${fx.a.teacher.id}`)
      .set(auth(fx.a.teacher.token));
    expect(byTeacher.status).toBe(200);
    expect(byTeacher.body.schedules.some((s: { id: string }) => s.id === scheduleId)).toBe(true);

    const byStudent = await request(app)
      .get(`/schedules?studentId=${fx.a.student.id}`)
      .set(auth(fx.a.student.token));
    expect(byStudent.status).toBe(200);
    expect(byStudent.body.schedules.some((s: { id: string }) => s.id === scheduleId)).toBe(true);

    const byParent = await request(app)
      .get(`/schedules?studentId=${fx.a.student.id}`)
      .set(auth(fx.parentA.token));
    expect(byParent.status).toBe(200);
    expect(byParent.body.schedules.some((s: { id: string }) => s.id === scheduleId)).toBe(true);
  });

  it('refuse un créneau sans classe', async () => {
    const res = await request(app)
      .post('/courses')
      .set(auth(fx.a.schoolAdmin.token))
      .send({
        name: 'Sans classe',
        institutionId: fx.a.institutionId,
        teacherId: fx.a.teacher.id,
        scheduleDay: 'Lundi',
        scheduleTime: '08:00',
        duration: 60,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/classe/i);
  });

  it('refuse un conflit d’emploi du temps (409) sans créer le cours', async () => {
    const first = await request(app)
      .post('/courses')
      .set(auth(fx.a.schoolAdmin.token))
      .send({
        name: 'Chimie créneau A',
        institutionId: fx.a.institutionId,
        teacherId: fx.a.teacher.id,
        classId: fx.a.classId,
        scheduleDay: 'Vendredi',
        scheduleTime: '09:00',
        duration: 60,
        room: 'Salle-Conflict',
      });
    expect(first.status).toBe(201);

    const conflict = await request(app)
      .post('/courses')
      .set(auth(fx.a.schoolAdmin.token))
      .send({
        name: 'Chimie créneau B',
        institutionId: fx.a.institutionId,
        teacherId: fx.a.teacher.id,
        classId: fx.a.classId,
        scheduleDay: 'Vendredi',
        scheduleTime: '09:30',
        duration: 60,
        room: 'Autre',
      });
    expect(conflict.status).toBe(409);
    expect(conflict.body.conflicts?.length).toBeGreaterThan(0);
  });

  it('désactive les créneaux quand le cours est supprimé', async () => {
    const created = await request(app)
      .post('/courses')
      .set(auth(fx.a.schoolAdmin.token))
      .send({
        name: 'SVT à retirer',
        institutionId: fx.a.institutionId,
        teacherId: fx.a.teacher.id,
        classId: fx.a.classId,
        scheduleDay: 'Samedi',
        scheduleTime: '11:00',
        duration: 45,
      });
    expect(created.status).toBe(201);
    const courseId = created.body.course.id as string;
    const scheduleId = created.body.schedule.id as string;

    const del = await request(app)
      .delete(`/courses/${courseId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(del.status).toBe(200);

    const byInst = await request(app)
      .get(`/schedules?institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(byInst.body.schedules.some((s: { id: string }) => s.id === scheduleId)).toBe(false);
  });
});
