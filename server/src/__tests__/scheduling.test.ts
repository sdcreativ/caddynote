import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, registerActor, auth, type Fixture, type Actor } from './fixtures.js';

/**
 * ACA-004 (détection de conflits) et ACA-005 (exceptions ponctuelles :
 * annulation/remplacement) + correctif d'isolation multi-tenant trouvé sur
 * GET /schedules (aucune des 3 branches ne vérifiait l'établissement).
 */
describe('Emploi du temps — conflits et exceptions (ACA-004/005)', () => {
  let fx: Fixture;
  let teacher2: Actor;
  let class2Id: string;

  beforeAll(async () => {
    fx = await buildFixture();

    // /auth/register crée désormais la ligne StrkTeacher (lib/roleExtensions.ts,
    // 16/08/2026) — plus besoin de la créer ici à la main.
    teacher2 = await registerActor('teacher', fx.a.institutionId);

    const class2Res = await request(app)
      .post('/classes')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ name: 'Autre classe', institutionId: fx.a.institutionId });
    class2Id = class2Res.body.class.id;
  }, 30000);

  const baseSlot = (overrides: Record<string, unknown> = {}) => ({
    courseId: fx.a.courseId,
    classId: fx.a.classId,
    institutionId: fx.a.institutionId,
    teacherId: fx.a.teacher.id,
    dayOfWeek: 1, // lundi
    startTime: '08:00',
    endTime: '09:00',
    room: 'Salle 101',
    ...overrides,
  });

  describe('ACA-004 — détection de conflits', () => {
    it('crée un créneau sans conflit', async () => {
      const res = await request(app).post('/schedules').set(auth(fx.a.schoolAdmin.token)).send(baseSlot());
      expect(res.status).toBe(201);
      expect(res.body.conflicts).toEqual([]);
    });

    it('détecte un conflit sur le même enseignant à un horaire qui se recoupe', async () => {
      const res = await request(app)
        .post('/schedules')
        .set(auth(fx.a.schoolAdmin.token))
        .send(baseSlot({ startTime: '08:30', endTime: '09:30', room: 'Salle 202', classId: class2Id }));
      expect(res.status).toBe(409);
      expect(res.body.conflicts.some((c: any) => c.reasons.includes('teacher'))).toBe(true);
    });

    it('détecte un conflit de salle même avec un enseignant et une classe différents', async () => {
      const res = await request(app)
        .post('/schedules')
        .set(auth(fx.a.schoolAdmin.token))
        .send(baseSlot({ teacherId: teacher2.id, classId: class2Id, startTime: '08:15', endTime: '08:45' }));
      expect(res.status).toBe(409);
      expect(res.body.conflicts.some((c: any) => c.reasons.includes('room'))).toBe(true);
    });

    it('aucun conflit si ni enseignant, ni salle, ni classe ne se recoupent', async () => {
      const res = await request(app)
        .post('/schedules')
        .set(auth(fx.a.schoolAdmin.token))
        .send(baseSlot({ teacherId: teacher2.id, classId: class2Id, room: 'Salle 303' }));
      expect(res.status).toBe(201);
    });

    it('aucun conflit un autre jour de la semaine', async () => {
      const res = await request(app).post('/schedules').set(auth(fx.a.schoolAdmin.token)).send(baseSlot({ dayOfWeek: 2 }));
      expect(res.status).toBe(201);
    });

    it('force:true permet de passer outre un conflit, et la trace est journalisée', async () => {
      const res = await request(app)
        .post('/schedules')
        .set(auth(fx.a.schoolAdmin.token))
        .send(baseSlot({ startTime: '08:30', endTime: '09:30', room: 'Salle 202', classId: class2Id, force: true }));
      expect(res.status).toBe(201);
      expect(res.body.conflicts.length).toBeGreaterThan(0);

      const logs = await request(app)
        .get(`/audit-log?institutionId=${fx.a.institutionId}&action=schedule.conflict_forced`)
        .set(auth(fx.a.schoolAdmin.token));
      expect(logs.body.logs.some((l: any) => l.targetId === res.body.schedule.id)).toBe(true);
    });

    it('POST /schedules/check-conflicts prévisualise sans créer', async () => {
      const res = await request(app)
        .post('/schedules/check-conflicts')
        .set(auth(fx.a.schoolAdmin.token))
        .send(baseSlot({ startTime: '08:15', endTime: '08:45' }));
      expect(res.status).toBe(200);
      expect(res.body.conflicts.length).toBeGreaterThan(0);
    });

    it('une modification (PATCH) qui recoupe un autre créneau est aussi bloquée', async () => {
      const created = await request(app)
        .post('/schedules')
        .set(auth(fx.a.schoolAdmin.token))
        .send(baseSlot({ teacherId: teacher2.id, classId: class2Id, room: 'Salle 404', dayOfWeek: 3 }));
      const patchRes = await request(app)
        .patch(`/schedules/${created.body.schedule.id}`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ dayOfWeek: 1, startTime: '08:00', endTime: '09:00', room: 'Salle 101' });
      expect(patchRes.status).toBe(409);

      // Ne se bloque jamais lui-même : re-soumettre sans changement réel passe.
      const noopPatch = await request(app)
        .patch(`/schedules/${created.body.schedule.id}`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ room: 'Salle 404' });
      expect(noopPatch.status).toBe(200);
    });

    it('isolation multi-tenant sur la création/modification', async () => {
      const res = await request(app)
        .post('/schedules')
        .set(auth(fx.b.schoolAdmin.token))
        .send(baseSlot({ institutionId: fx.a.institutionId }));
      expect(res.status).toBe(403);
    });
  });

  describe('ACA-005 — exceptions ponctuelles', () => {
    let scheduleId: string;

    beforeAll(async () => {
      const res = await request(app)
        .post('/schedules')
        .set(auth(fx.a.schoolAdmin.token))
        .send(baseSlot({ dayOfWeek: 4, room: 'Salle Exceptions', teacherId: teacher2.id, classId: class2Id }));
      scheduleId = res.body.schedule.id;
    });

    it('annule une occurrence précise sans toucher à la règle récurrente', async () => {
      const res = await request(app)
        .post(`/schedules/${scheduleId}/exceptions`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ date: '2026-09-03', type: 'cancelled', reason: 'Sortie scolaire' }); // un jeudi
      expect(res.status).toBe(201);
      expect(res.body.exception.type).toBe('cancelled');

      const listRes = await request(app).get(`/schedules/${scheduleId}/exceptions`).set(auth(fx.a.schoolAdmin.token));
      expect(listRes.body.exceptions).toHaveLength(1);
    });

    it('refuse un remplacement sans enseignant remplaçant', async () => {
      const res = await request(app)
        .post(`/schedules/${scheduleId}/exceptions`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ date: '2026-09-10', type: 'substituted' });
      expect(res.status).toBe(400);
    });

    it('refuse un enseignant remplaçant d’un autre établissement', async () => {
      const res = await request(app)
        .post(`/schedules/${scheduleId}/exceptions`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ date: '2026-09-10', type: 'substituted', substituteTeacherId: fx.b.teacher.id });
      expect(res.status).toBe(400);
    });

    it('enregistre un remplacement valide, et re-soumettre pour la même date met à jour plutôt que dupliquer', async () => {
      const first = await request(app)
        .post(`/schedules/${scheduleId}/exceptions`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ date: '2026-09-10', type: 'substituted', substituteTeacherId: fx.a.teacher.id, reason: 'Congé' });
      expect(first.status).toBe(201);

      const second = await request(app)
        .post(`/schedules/${scheduleId}/exceptions`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ date: '2026-09-10', type: 'cancelled', reason: 'Finalement annulé' });
      expect(second.status).toBe(201);
      expect(second.body.exception.id).toBe(first.body.exception.id);

      const listRes = await request(app).get(`/schedules/${scheduleId}/exceptions`).set(auth(fx.a.schoolAdmin.token));
      expect(listRes.body.exceptions.filter((e: any) => e.date.startsWith('2026-09-10'))).toHaveLength(1);
    });

    it('supprime une exception (retour au créneau normal), avec isolation multi-tenant', async () => {
      const created = await request(app)
        .post(`/schedules/${scheduleId}/exceptions`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ date: '2026-09-17', type: 'cancelled' });

      const crossDelete = await request(app)
        .delete(`/schedules/exceptions/${created.body.exception.id}`)
        .set(auth(fx.b.schoolAdmin.token));
      expect(crossDelete.status).toBe(403);

      const okDelete = await request(app)
        .delete(`/schedules/exceptions/${created.body.exception.id}`)
        .set(auth(fx.a.schoolAdmin.token));
      expect(okDelete.status).toBe(200);
    });

    it('GET /schedules/effective applique les exceptions sur la période demandée', async () => {
      const res = await request(app)
        .get(
          `/schedules/effective?institutionId=${fx.a.institutionId}&classId=${class2Id}&from=2026-09-01&to=2026-09-14`
        )
        .set(auth(fx.a.schoolAdmin.token));
      expect(res.status).toBe(200);

      const cancelled = res.body.occurrences.find((o: any) => o.date === '2026-09-03' && o.scheduleId === scheduleId);
      expect(cancelled?.status).toBe('cancelled');

      const substituted = res.body.occurrences.find((o: any) => o.date === '2026-09-10' && o.scheduleId === scheduleId);
      // Le dernier état enregistré pour le 10/09 est "cancelled" (test précédent).
      expect(substituted?.status).toBe('cancelled');

      // Seuls les jeudis 03 et 10 tombent dans la période demandée (2026-09-01
      // au 2026-09-14) — les deux ont une exception, aucune occurrence "normal".
      const forThisSchedule = res.body.occurrences.filter((o: any) => o.scheduleId === scheduleId);
      expect(forThisSchedule).toHaveLength(2);
      expect(forThisSchedule.every((o: any) => o.status !== 'normal')).toBe(true);
    });

    it('isolation multi-tenant sur les exceptions et les occurrences effectives', async () => {
      const crossCreate = await request(app)
        .post(`/schedules/${scheduleId}/exceptions`)
        .set(auth(fx.b.schoolAdmin.token))
        .send({ date: '2026-09-24', type: 'cancelled' });
      expect(crossCreate.status).toBe(403);

      const crossEffective = await request(app)
        .get(`/schedules/effective?institutionId=${fx.a.institutionId}&classId=${class2Id}&from=2026-09-01&to=2026-09-14`)
        .set(auth(fx.b.schoolAdmin.token));
      expect(crossEffective.status).toBe(403);
    });
  });

  describe('Correctif ORG-004 sur GET /schedules', () => {
    it('refuse la lecture de l’emploi du temps d’un élève, enseignant ou classe d’un autre établissement', async () => {
      const byStudent = await request(app).get(`/schedules?studentId=${fx.a.student.id}`).set(auth(fx.b.teacher.token));
      expect(byStudent.status).toBe(403);

      const byTeacher = await request(app).get(`/schedules?teacherId=${fx.a.teacher.id}`).set(auth(fx.b.teacher.token));
      expect(byTeacher.status).toBe(403);

      const byClass = await request(app).get(`/schedules?classId=${fx.a.classId}`).set(auth(fx.b.teacher.token));
      expect(byClass.status).toBe(403);
    });

    it('autorise toujours la lecture par le personnel du même établissement', async () => {
      const res = await request(app).get(`/schedules?classId=${fx.a.classId}`).set(auth(fx.a.schoolAdmin.token));
      expect(res.status).toBe(200);
    });
  });

  describe('ACA-003 — duplication', () => {
    it('duplique un créneau en ne changeant que le jour, réutilise le reste', async () => {
      const source = await request(app).post('/schedules').set(auth(fx.a.schoolAdmin.token)).send(
        baseSlot({ classId: class2Id, dayOfWeek: 3, startTime: '10:00', endTime: '11:00' })
      );
      expect(source.status).toBe(201);

      const dup = await request(app)
        .post(`/schedules/${source.body.schedule.id}/duplicate`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ dayOfWeek: 4 });
      expect(dup.status).toBe(201);
      expect(dup.body.schedule.dayOfWeek).toBe(4);
      expect(dup.body.schedule.startTime).toBe('10:00');
      expect(dup.body.schedule.room).toBe('Salle 101');
      expect(dup.body.schedule.courseId).toBe(fx.a.courseId);
    });

    it('un duplicata en conflit est bloqué comme une création normale, sauf force:true', async () => {
      const source = await request(app).post('/schedules').set(auth(fx.a.schoolAdmin.token)).send(
        baseSlot({ classId: class2Id, teacherId: teacher2.id, dayOfWeek: 5, startTime: '09:00', endTime: '10:00', room: 'Salle 202' })
      );
      expect(source.status).toBe(201);

      // Duplication qui ne change rien -> recoupe exactement le créneau source lui-même.
      const blocked = await request(app)
        .post(`/schedules/${source.body.schedule.id}/duplicate`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({});
      expect(blocked.status).toBe(409);
      expect(blocked.body.conflicts.length).toBeGreaterThan(0);

      const forced = await request(app)
        .post(`/schedules/${source.body.schedule.id}/duplicate`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ force: true });
      expect(forced.status).toBe(201);
    });

    it("le personnel d'un autre établissement ne peut pas dupliquer (ORG-004)", async () => {
      const source = await request(app).post('/schedules').set(auth(fx.a.schoolAdmin.token)).send(
        baseSlot({ classId: class2Id, dayOfWeek: 6, startTime: '08:00', endTime: '09:00' })
      );
      expect(source.status).toBe(201);

      const res = await request(app)
        .post(`/schedules/${source.body.schedule.id}/duplicate`)
        .set(auth(fx.b.schoolAdmin.token))
        .send({ dayOfWeek: 0 });
      expect(res.status).toBe(404);
    });
  });
});
