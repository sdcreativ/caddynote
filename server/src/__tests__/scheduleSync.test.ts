import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * §5.7 — sync emploi du temps : élève, parent et personnel voient le même
 * créneau de classe ; isolation cross-tenant.
 * Les recettes conflits/exceptions restent dans `scheduling.test.ts` (ACA-004/005).
 */
describe('Emploi du temps — sync parent / élève / personnel (§5.7)', () => {
  let fx: Fixture;
  let scheduleId: string;

  beforeAll(async () => {
    fx = await buildFixture();
    const created = await request(app).post('/schedules').set(auth(fx.a.schoolAdmin.token)).send({
      courseId: fx.a.courseId,
      classId: fx.a.classId,
      institutionId: fx.a.institutionId,
      teacherId: fx.a.teacher.id,
      dayOfWeek: 2,
      startTime: '10:00',
      endTime: '11:00',
      room: 'Sync-Room',
    });
    expect(created.status).toBe(201);
    scheduleId = created.body.schedule.id as string;
  }, 30000);

  const ids = (res: { body: { schedules: { id: string }[] } }) =>
    (res.body.schedules ?? []).map((s) => s.id);

  it('l’élève voit le créneau de sa classe', async () => {
    const res = await request(app)
      .get(`/schedules?studentId=${fx.a.student.id}`)
      .set(auth(fx.a.student.token));
    expect(res.status).toBe(200);
    expect(ids(res)).toContain(scheduleId);
  });

  it('le parent lié voit le même créneau que l’élève', async () => {
    const res = await request(app)
      .get(`/schedules?studentId=${fx.a.student.id}`)
      .set(auth(fx.parentA.token));
    expect(res.status).toBe(200);
    expect(ids(res)).toContain(scheduleId);

    const asStudent = await request(app)
      .get(`/schedules?studentId=${fx.a.student.id}`)
      .set(auth(fx.a.student.token));
    expect(ids(res).sort()).toEqual(ids(asStudent).sort());
  });

  it('le personnel (classe / enseignant / établissement) voit le créneau', async () => {
    const byClass = await request(app)
      .get(`/schedules?classId=${fx.a.classId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(byClass.status).toBe(200);
    expect(ids(byClass)).toContain(scheduleId);

    const byTeacher = await request(app)
      .get(`/schedules?teacherId=${fx.a.teacher.id}`)
      .set(auth(fx.a.teacher.token));
    expect(byTeacher.status).toBe(200);
    expect(ids(byTeacher)).toContain(scheduleId);

    const byInst = await request(app)
      .get(`/schedules?institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(byInst.status).toBe(200);
    expect(ids(byInst)).toContain(scheduleId);
  });

  it('un parent / enseignant d’un autre établissement ne lit pas l’EDT', async () => {
    const crossParent = await request(app)
      .get(`/schedules?studentId=${fx.a.student.id}`)
      .set(auth(fx.b.teacher.token));
    expect(crossParent.status).toBe(403);

    const crossStudent = await request(app)
      .get(`/schedules?studentId=${fx.a.student.id}`)
      .set(auth(fx.b.student.token));
    expect(crossStudent.status).toBe(403);
  });
});

describe('Emploi du temps — recette conflits + exceptions (§5.7 P1)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it('cycle : créer → conflit 409 → exception annulation → effective cancelled', async () => {
    const slot = {
      courseId: fx.a.courseId,
      classId: fx.a.classId,
      institutionId: fx.a.institutionId,
      teacherId: fx.a.teacher.id,
      dayOfWeek: 3,
      startTime: '14:00',
      endTime: '15:00',
      room: 'Recette-P1',
    };

    const created = await request(app).post('/schedules').set(auth(fx.a.schoolAdmin.token)).send(slot);
    expect(created.status).toBe(201);
    const scheduleId = created.body.schedule.id as string;

    const conflict = await request(app)
      .post('/schedules')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ ...slot, room: 'Autre-salle' });
    expect(conflict.status).toBe(409);
    expect(conflict.body.conflicts.some((c: { reasons: string[] }) => c.reasons.includes('teacher'))).toBe(true);

    // 2026-09-02 = mercredi
    const cancelled = await request(app)
      .post(`/schedules/${scheduleId}/exceptions`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ date: '2026-09-02', type: 'cancelled', reason: 'Recette' });
    expect(cancelled.status).toBe(201);

    const effective = await request(app)
      .get(
        `/schedules/effective?institutionId=${fx.a.institutionId}&classId=${fx.a.classId}&from=2026-09-01&to=2026-09-03`
      )
      .set(auth(fx.a.schoolAdmin.token));
    expect(effective.status).toBe(200);
    const occ = effective.body.occurrences.find(
      (o: { scheduleId: string; date: string }) => o.scheduleId === scheduleId && o.date === '2026-09-02'
    );
    expect(occ?.status).toBe('cancelled');
  });
});
