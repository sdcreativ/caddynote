import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, auth, issueTestToken, type Fixture, type Actor } from './fixtures.js';

/**
 * §5.11 — recette incidents + notifications parents ; droits supervisor vs teacher.
 */
describe('Suivi / discipline — notifications & rôles (§5.11)', () => {
  let fx: Fixture;
  let supervisor: Actor;

  beforeAll(async () => {
    fx = await buildFixture();
    const created = await request(app)
      .post('/users')
      .set(auth(fx.a.schoolAdmin.token))
      .send({
        email: `supervisor.${Date.now()}@isolation.test`,
        firstName: 'Vie',
        lastName: 'Scolaire',
        role: 'supervisor',
        institutionId: fx.a.institutionId,
      });
    expect(created.status).toBe(201);
    const id = created.body.user.id as string;
    const token = await issueTestToken({
      sub: id,
      role: 'supervisor',
      institutionId: fx.a.institutionId,
    });
    supervisor = { id, token, email: created.body.user.email };
  }, 30000);

  describe('P1 — incidents + notifications parents', () => {
    it('partage famille → notification push au responsable (canViewDiscipline)', async () => {
      const before = await prisma.notification.count({ where: { userId: fx.parentA.id } });

      const created = await request(app)
        .post('/discipline/incidents')
        .set(auth(fx.a.teacher.token))
        .send({
          studentId: fx.a.student.id,
          description: `Incident partagé §5.11 ${Date.now()}`,
          visibleToFamily: true,
        });
      expect(created.status).toBe(201);

      const after = await prisma.notification.count({ where: { userId: fx.parentA.id } });
      expect(after).toBe(before + 1);

      const log = await prisma.strkCommunicationLog.findFirst({
        where: { recipientId: fx.parentA.id, useCase: 'discipline_shared' },
        orderBy: { requestedAt: 'desc' },
      });
      expect(log?.status).toBe('delivered');
      expect(log?.skippedOptOut).toBe(false);
    });

    it('confidentialité → visibleToFamily notifie ; sans partage aucune notif', async () => {
      const created = await request(app)
        .post('/discipline/incidents')
        .set(auth(fx.a.teacher.token))
        .send({
          studentId: fx.a.student.id,
          description: `Incident privé §5.11 ${Date.now()}`,
          visibleToFamily: false,
        });
      expect(created.status).toBe(201);
      const incidentId = created.body.incident.id as string;

      const before = await prisma.notification.count({ where: { userId: fx.parentA.id } });
      const share = await request(app)
        .patch(`/discipline/incidents/${incidentId}/confidentiality`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ visibleToFamily: true });
      expect(share.status).toBe(200);
      const after = await prisma.notification.count({ where: { userId: fx.parentA.id } });
      expect(after).toBe(before + 1);
    });

    it('décision sur incident visible → notification discipline_decision', async () => {
      const created = await request(app)
        .post('/discipline/incidents')
        .set(auth(fx.a.teacher.token))
        .send({
          studentId: fx.a.student.id,
          description: `Pour décision §5.11 ${Date.now()}`,
          visibleToFamily: true,
          severity: 'moderate',
        });
      const incidentId = created.body.incident.id as string;

      await request(app)
        .patch(`/discipline/incidents/${incidentId}/status`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ status: 'under_review' });
      await request(app)
        .patch(`/discipline/incidents/${incidentId}/status`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ status: 'council_referred' });

      const before = await prisma.notification.count({ where: { userId: fx.parentA.id } });
      const decision = await request(app)
        .post(`/discipline/incidents/${incidentId}/decision`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ decision: 'Avertissement §5.11', sanctionType: 'warning' });
      expect(decision.status).toBe(200);

      const after = await prisma.notification.count({ where: { userId: fx.parentA.id } });
      expect(after).toBe(before + 1);
      const log = await prisma.strkCommunicationLog.findFirst({
        where: { recipientId: fx.parentA.id, useCase: 'discipline_decision' },
        orderBy: { requestedAt: 'desc' },
      });
      expect(log?.body).toContain('Avertissement §5.11');
    });
  });

  describe('P2 — supervisor vs teacher', () => {
    it('supervisor signale un incident mais ne pilote pas le workflow', async () => {
      const created = await request(app)
        .post('/discipline/incidents')
        .set(auth(supervisor.token))
        .send({
          studentId: fx.a.student.id,
          description: `Signalement supervisor ${Date.now()}`,
        });
      expect(created.status).toBe(201);
      const incidentId = created.body.incident.id as string;

      const status = await request(app)
        .patch(`/discipline/incidents/${incidentId}/status`)
        .set(auth(supervisor.token))
        .send({ status: 'under_review' });
      expect(status.status).toBe(403);

      const decision = await request(app)
        .post(`/discipline/incidents/${incidentId}/decision`)
        .set(auth(supervisor.token))
        .send({ decision: 'Non' });
      expect(decision.status).toBe(403);

      const conf = await request(app)
        .patch(`/discipline/incidents/${incidentId}/confidentiality`)
        .set(auth(supervisor.token))
        .send({ visibleToFamily: true });
      expect(conf.status).toBe(403);

      // Teacher idem : signaler OK, avancer KO
      const byTeacher = await request(app)
        .patch(`/discipline/incidents/${incidentId}/status`)
        .set(auth(fx.a.teacher.token))
        .send({ status: 'under_review' });
      expect(byTeacher.status).toBe(403);

      const byAdmin = await request(app)
        .patch(`/discipline/incidents/${incidentId}/status`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ status: 'under_review' });
      expect(byAdmin.status).toBe(200);
    });

    it('supervisor ne crée pas d’observation pédagogique (réservé enseignement)', async () => {
      const res = await request(app).post('/observations').set(auth(supervisor.token)).send({
        studentId: fx.a.student.id,
        title: 'Tentative supervisor',
        description: 'Ne doit pas passer',
      });
      expect(res.status).toBe(403);

      const asTeacher = await request(app).post('/observations').set(auth(fx.a.teacher.token)).send({
        studentId: fx.a.student.id,
        title: 'OK enseignant',
        description: 'Observation pédagogique',
      });
      expect(asTeacher.status).toBe(201);
    });

    it('observation restreinte à l’auteur : supervisor (staff) ne la voit pas, direction oui', async () => {
      const created = await request(app).post('/observations').set(auth(fx.a.teacher.token)).send({
        studentId: fx.a.student.id,
        title: 'Confidentielle enseignant',
        description: 'Cercle restreint',
        restrictedToUserIds: [fx.a.teacher.id],
      });
      const observationId = created.body.observation.id as string;

      const asSupervisor = await request(app)
        .get(`/observations?studentId=${fx.a.student.id}`)
        .set(auth(supervisor.token));
      expect(asSupervisor.status).toBe(200);
      expect(asSupervisor.body.observations.some((o: { id: string }) => o.id === observationId)).toBe(false);

      const asAdmin = await request(app)
        .get(`/observations?studentId=${fx.a.student.id}`)
        .set(auth(fx.a.schoolAdmin.token));
      expect(asAdmin.body.observations.some((o: { id: string }) => o.id === observationId)).toBe(true);
    });
  });
});
