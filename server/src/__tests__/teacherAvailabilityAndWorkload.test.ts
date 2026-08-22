import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, registerActor, auth, type Fixture } from './fixtures.js';

/**
 * PER-003 (disponibilités/remplacements) et PER-004 (charge horaire
 * prévue/réalisée), qui réutilise le moteur d'occurrences effectives
 * construit pour ACA-004/005.
 */
describe('Disponibilités enseignant et charge horaire (PER-003/004)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  describe('PER-003 — disponibilités', () => {
    it('une déclaration par l’enseignant lui-même reste "requested" jusqu’à validation', async () => {
      const res = await request(app).post('/teacher-availability').set(auth(fx.a.teacher.token)).send({
        teacherId: fx.a.teacher.id,
        institutionId: fx.a.institutionId,
        startDate: '2026-10-01',
        endDate: '2026-10-05',
        reason: 'Congé',
      });
      expect(res.status).toBe(201);
      expect(res.body.availability.status).toBe('requested');
    });

    it('une déclaration créée directement par la direction est approuvée d’emblée', async () => {
      const res = await request(app).post('/teacher-availability').set(auth(fx.a.schoolAdmin.token)).send({
        teacherId: fx.a.teacher.id,
        institutionId: fx.a.institutionId,
        startDate: '2026-11-01',
        endDate: '2026-11-02',
      });
      expect(res.status).toBe(201);
      expect(res.body.availability.status).toBe('approved');
      expect(res.body.availability.reviewedBy).toBe(fx.a.schoolAdmin.id);
    });

    it('un enseignant ne peut pas déclarer une indisponibilité pour un collègue', async () => {
      const res = await request(app).post('/teacher-availability').set(auth(fx.a.teacher.token)).send({
        teacherId: fx.a.schoolAdmin.id,
        institutionId: fx.a.institutionId,
        startDate: '2026-10-01',
        endDate: '2026-10-02',
      });
      expect(res.status).toBe(403);
    });

    it('refuse une date de fin antérieure à la date de début', async () => {
      const res = await request(app).post('/teacher-availability').set(auth(fx.a.teacher.token)).send({
        teacherId: fx.a.teacher.id,
        institutionId: fx.a.institutionId,
        startDate: '2026-10-05',
        endDate: '2026-10-01',
      });
      expect(res.status).toBe(400);
    });

    it('la direction approuve ou rejette une déclaration en attente, jamais deux fois', async () => {
      const created = await request(app).post('/teacher-availability').set(auth(fx.a.teacher.token)).send({
        teacherId: fx.a.teacher.id,
        institutionId: fx.a.institutionId,
        startDate: '2026-12-01',
        endDate: '2026-12-02',
      });
      const id = created.body.availability.id;

      const byTeacher = await request(app).patch(`/teacher-availability/${id}/status`).set(auth(fx.a.teacher.token)).send({ status: 'approved' });
      expect(byTeacher.status).toBe(403); // un enseignant ne s'auto-approuve pas

      const approve = await request(app).patch(`/teacher-availability/${id}/status`).set(auth(fx.a.schoolAdmin.token)).send({ status: 'approved' });
      expect(approve.status).toBe(200);
      expect(approve.body.availability.status).toBe('approved');

      const again = await request(app).patch(`/teacher-availability/${id}/status`).set(auth(fx.a.schoolAdmin.token)).send({ status: 'rejected' });
      expect(again.status).toBe(409); // déjà traitée
    });

    it('signale les créneaux planifiés qui tombent dans la période déclarée', async () => {
      // fx.a.courseId est planifié le lundi (fixtures.ts) — on couvre une
      // période avec un créneau réellement dû, pour vérifier que le
      // signalement le retrouve.
      const scheduleRes = await request(app).post('/schedules').set(auth(fx.a.schoolAdmin.token)).send({
        courseId: fx.a.courseId,
        classId: fx.a.classId,
        institutionId: fx.a.institutionId,
        teacherId: fx.a.teacher.id,
        dayOfWeek: 1, // lundi — 2027-01-04 est un lundi
        startTime: '09:00',
        endTime: '10:00',
        room: 'Salle Dispo',
      });
      expect(scheduleRes.status).toBe(201);

      const availability = await request(app).post('/teacher-availability').set(auth(fx.a.schoolAdmin.token)).send({
        teacherId: fx.a.teacher.id,
        institutionId: fx.a.institutionId,
        startDate: '2027-01-04',
        endDate: '2027-01-04',
      });
      expect(availability.status).toBe(201);

      const conflicts = await request(app)
        .get(`/teacher-availability/${availability.body.availability.id}/conflicts`)
        .set(auth(fx.a.schoolAdmin.token));
      expect(conflicts.status).toBe(200);
      expect(conflicts.body.conflicts.some((c: any) => c.scheduleId === scheduleRes.body.schedule.id && c.needsAction === true)).toBe(true);
    });

    it('isolation multi-tenant sur la déclaration, la consultation et l’approbation', async () => {
      const cross = await request(app).post('/teacher-availability').set(auth(fx.b.schoolAdmin.token)).send({
        teacherId: fx.a.teacher.id,
        institutionId: fx.a.institutionId,
        startDate: '2026-10-01',
        endDate: '2026-10-02',
      });
      expect(cross.status).toBe(403);

      const crossList = await request(app)
        .get(`/teacher-availability?institutionId=${fx.a.institutionId}`)
        .set(auth(fx.b.schoolAdmin.token));
      expect(crossList.status).toBe(403);

      const own = await request(app).post('/teacher-availability').set(auth(fx.a.teacher.token)).send({
        teacherId: fx.a.teacher.id,
        institutionId: fx.a.institutionId,
        startDate: '2026-09-01',
        endDate: '2026-09-02',
      });
      const crossApprove = await request(app)
        .patch(`/teacher-availability/${own.body.availability.id}/status`)
        .set(auth(fx.b.schoolAdmin.token))
        .send({ status: 'approved' });
      expect(crossApprove.status).toBe(403);
    });
  });

  describe('PER-004 — charge horaire prévue/réalisée', () => {
    // Enseignant dédié à chaque scénario : la charge horaire agrège TOUS les
    // créneaux d'un enseignant sur une période — réutiliser fx.a.teacher (déjà
    // affecté à un créneau récurrent le lundi par le test de signalement de
    // conflits ci-dessus, qui tombe justement sur la semaine du 2027-02-01)
    // fausserait le total attendu.
    // /auth/register crée désormais la ligne StrkTeacher (lib/roleExtensions.ts,
    // 16/08/2026) — plus besoin de la créer ici à la main.
    const makeTeacher = async () => registerActor('teacher', fx.a.institutionId);

    it('calcule le prévu et le réalisé, en tenant compte des exceptions', async () => {
      const teacher = await makeTeacher();
      const subjectRes = await request(app)
        .post('/subjects')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ name: 'Matière charge horaire', institutionId: fx.a.institutionId });
      const courseRes = await request(app)
        .post('/courses')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ name: 'Cours charge horaire', institutionId: fx.a.institutionId, teacherId: teacher.id, classId: fx.a.classId, subjectId: subjectRes.body.subject.id });

      // Deux créneaux hebdomadaires distincts : mardi 8h-9h30 (90 min), mercredi 10h-11h (60 min).
      const scheduleA = await request(app).post('/schedules').set(auth(fx.a.schoolAdmin.token)).send({
        courseId: courseRes.body.course.id,
        classId: fx.a.classId,
        institutionId: fx.a.institutionId,
        teacherId: teacher.id,
        dayOfWeek: 2,
        startTime: '08:00',
        endTime: '09:30',
        room: 'Salle Charge A',
      });
      const scheduleB = await request(app).post('/schedules').set(auth(fx.a.schoolAdmin.token)).send({
        courseId: courseRes.body.course.id,
        classId: fx.a.classId,
        institutionId: fx.a.institutionId,
        teacherId: teacher.id,
        dayOfWeek: 3,
        startTime: '10:00',
        endTime: '11:00',
        room: 'Salle Charge B',
      });
      expect(scheduleA.status).toBe(201);
      expect(scheduleB.status).toBe(201);

      // Semaine du 2027-02-01 (lundi) au 2027-02-07 (dimanche) : mardi
      // 2027-02-02, mercredi 2027-02-03.
      const before = await request(app)
        .get(`/schedules/workload?institutionId=${fx.a.institutionId}&teacherId=${teacher.id}&from=2027-02-01&to=2027-02-07`)
        .set(auth(teacher.token));
      expect(before.status).toBe(200);
      expect(before.body.workload.plannedMinutes).toBe(150); // 90 + 60
      expect(before.body.workload.realizedMinutes).toBe(150); // rien d'annulé/remplacé

      // Le créneau du mardi est annulé cette semaine-là.
      const cancelRes = await request(app)
        .post(`/schedules/${scheduleA.body.schedule.id}/exceptions`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ date: '2027-02-02', type: 'cancelled', reason: 'Sortie scolaire' });
      expect(cancelRes.status).toBe(201);

      const after = await request(app)
        .get(`/schedules/workload?institutionId=${fx.a.institutionId}&teacherId=${teacher.id}&from=2027-02-01&to=2027-02-07`)
        .set(auth(teacher.token));
      expect(after.body.workload.plannedMinutes).toBe(150); // le prévu ne change pas
      expect(after.body.workload.realizedMinutes).toBe(60); // seul le mercredi a eu lieu
      expect(after.body.workload.occurrences.cancelled).toBe(1);
    });

    it('un remplaçant voit les heures couvertes s’ajouter à son réalisé', async () => {
      const teacher = await makeTeacher();
      const substitute = await makeTeacher();
      const subjectRes = await request(app)
        .post('/subjects')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ name: 'Matière remplacement', institutionId: fx.a.institutionId });
      const courseRes = await request(app)
        .post('/courses')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ name: 'Cours remplacement', institutionId: fx.a.institutionId, teacherId: teacher.id, classId: fx.a.classId, subjectId: subjectRes.body.subject.id });
      const schedule = await request(app).post('/schedules').set(auth(fx.a.schoolAdmin.token)).send({
        courseId: courseRes.body.course.id,
        classId: fx.a.classId,
        institutionId: fx.a.institutionId,
        teacherId: teacher.id,
        dayOfWeek: 4,
        startTime: '14:00',
        endTime: '15:00',
        room: 'Salle Remplacement',
      });

      const substituteBefore = await request(app)
        .get(`/schedules/workload?institutionId=${fx.a.institutionId}&teacherId=${substitute.id}&from=2027-03-01&to=2027-03-07`)
        .set(auth(substitute.token));
      expect(substituteBefore.body.workload.realizedMinutes).toBe(0);

      // 2027-03-04 est un jeudi.
      await request(app)
        .post(`/schedules/${schedule.body.schedule.id}/exceptions`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ date: '2027-03-04', type: 'substituted', substituteTeacherId: substitute.id });

      const substituteAfter = await request(app)
        .get(`/schedules/workload?institutionId=${fx.a.institutionId}&teacherId=${substitute.id}&from=2027-03-01&to=2027-03-07`)
        .set(auth(substitute.token));
      expect(substituteAfter.body.workload.realizedMinutes).toBe(60);
      expect(substituteAfter.body.workload.occurrences.substituteCovered).toBe(1);

      // L'enseignant remplacé, lui, ne réalise pas ce créneau cette semaine-là.
      const originalTeacher = await request(app)
        .get(`/schedules/workload?institutionId=${fx.a.institutionId}&teacherId=${teacher.id}&from=2027-03-01&to=2027-03-07`)
        .set(auth(teacher.token));
      expect(originalTeacher.body.workload.occurrences.substitutedAway).toBe(1);
    });

    it('un enseignant ne peut consulter que sa propre charge horaire, la direction celle de tous', async () => {
      const teacher = await makeTeacher();

      const own = await request(app)
        .get(`/schedules/workload?institutionId=${fx.a.institutionId}&teacherId=${teacher.id}&from=2027-02-01&to=2027-02-07`)
        .set(auth(teacher.token));
      expect(own.status).toBe(200);

      const others = await request(app)
        .get(`/schedules/workload?institutionId=${fx.a.institutionId}&teacherId=${fx.a.schoolAdmin.id}&from=2027-02-01&to=2027-02-07`)
        .set(auth(teacher.token));
      expect(others.status).toBe(403);

      const staffView = await request(app)
        .get(`/schedules/workload?institutionId=${fx.a.institutionId}&teacherId=${teacher.id}&from=2027-02-01&to=2027-02-07`)
        .set(auth(fx.a.schoolAdmin.token));
      expect(staffView.status).toBe(200);

      const cross = await request(app)
        .get(`/schedules/workload?institutionId=${fx.a.institutionId}&teacherId=${teacher.id}&from=2027-02-01&to=2027-02-07`)
        .set(auth(fx.b.schoolAdmin.token));
      expect(cross.status).toBe(403);
    });
  });
});
