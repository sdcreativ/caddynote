import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * §5.14 — recette module par module + flags `lot9_services` / `canteen`.
 */
describe('Services Lot 9 — modules + flags (§5.14)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  afterAll(async () => {
    await request(app)
      .put(`/institutions/${fx.a.institutionId}/features/lot9_services`)
      .set(auth(fx.globalAdmin.token))
      .send({ enabled: null })
      .catch(() => {});
    await request(app)
      .put(`/institutions/${fx.a.institutionId}/features/canteen`)
      .set(auth(fx.globalAdmin.token))
      .send({ enabled: null })
      .catch(() => {});
    await request(app)
      .put(`/institutions/${fx.a.institutionId}/features/lot9Services`)
      .set(auth(fx.globalAdmin.token))
      .send({ enabled: null })
      .catch(() => {});
  });

  describe('P1 — flags', () => {
    it('lot9_services=false → 403 feature_disabled sur /services/*', async () => {
      await request(app)
        .put(`/institutions/${fx.a.institutionId}/features/lot9_services`)
        .set(auth(fx.globalAdmin.token))
        .send({ enabled: false });

      const res = await request(app)
        .get('/services/transport/routes')
        .set(auth(fx.a.schoolAdmin.token));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('feature_disabled');

      // Alias lot9Services
      await request(app)
        .put(`/institutions/${fx.a.institutionId}/features/lot9_services`)
        .set(auth(fx.globalAdmin.token))
        .send({ enabled: null });
      await request(app)
        .put(`/institutions/${fx.a.institutionId}/features/lot9Services`)
        .set(auth(fx.globalAdmin.token))
        .send({ enabled: false });

      const alias = await request(app)
        .get('/services/library/items')
        .set(auth(fx.a.schoolAdmin.token));
      expect(alias.status).toBe(403);
      expect(alias.body.code).toBe('feature_disabled');

      await request(app)
        .put(`/institutions/${fx.a.institutionId}/features/lot9Services`)
        .set(auth(fx.globalAdmin.token))
        .send({ enabled: null });
    });

    it('canteen=false → cantine 403, transport reste OK', async () => {
      await request(app)
        .put(`/institutions/${fx.a.institutionId}/features/canteen`)
        .set(auth(fx.globalAdmin.token))
        .send({ enabled: false });

      const canteen = await request(app)
        .get('/services/canteen/plans')
        .set(auth(fx.a.schoolAdmin.token));
      expect(canteen.status).toBe(403);
      expect(canteen.body.code).toBe('feature_disabled');

      const transport = await request(app)
        .get('/services/transport/routes')
        .set(auth(fx.a.schoolAdmin.token));
      expect(transport.status).toBe(200);

      await request(app)
        .put(`/institutions/${fx.a.institutionId}/features/canteen`)
        .set(auth(fx.globalAdmin.token))
        .send({ enabled: null });
    });
  });

  describe('P1 — modules', () => {
    it('cantine : formule → abonnement → clôture', async () => {
      const plan = await request(app)
        .post('/services/canteen/plans')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ name: `Formule-${Date.now()}`, priceCents: 15000 });
      expect(plan.status).toBe(201);
      const planId = plan.body.plan.id as string;

      const sub = await request(app)
        .post(`/services/canteen/plans/${planId}/subscribe`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ studentId: fx.a.student.id });
      expect(sub.status).toBe(201);

      const dup = await request(app)
        .post(`/services/canteen/plans/${planId}/subscribe`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ studentId: fx.a.student.id });
      expect(dup.status).toBe(409);

      const end = await request(app)
        .post(`/services/canteen/subscriptions/${sub.body.subscription.id}/end`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({});
      expect(end.status).toBe(200);

      const list = await request(app)
        .get('/services/canteen/plans')
        .set(auth(fx.a.schoolAdmin.token));
      expect(list.status).toBe(200);
      const found = list.body.plans.find((p: { id: string }) => p.id === planId);
      expect(found).toBeTruthy();
    });

    it('internat : chambre → affectation capacité → libération', async () => {
      const room = await request(app)
        .post('/services/boarding/rooms')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ label: `A-${Date.now()}`, capacity: 1 });
      expect(room.status).toBe(201);
      const roomId = room.body.room.id as string;

      const assign = await request(app)
        .post(`/services/boarding/rooms/${roomId}/assign`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ studentId: fx.a.student.id });
      expect(assign.status).toBe(201);

      const full = await request(app)
        .post(`/services/boarding/rooms/${roomId}/assign`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ studentId: fx.a.student.id });
      expect([409, 400]).toContain(full.status);

      const end = await request(app)
        .post(`/services/boarding/assignments/${assign.body.assignment.id}/end`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({});
      expect(end.status).toBe(200);
    });

    it('transport / bibliothèque / clinique / RH restent accessibles', async () => {
      const route = await request(app)
        .post('/services/transport/routes')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ name: `Ligne-§514-${Date.now()}`, capacity: 10 });
      expect(route.status).toBe(201);

      const item = await request(app)
        .post('/services/library/items')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ title: `Livre-§514-${Date.now()}`, quantity: 2 });
      expect(item.status).toBe(201);

      const visit = await request(app)
        .post('/services/clinic/visits')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ studentId: fx.a.student.id, reason: 'Contrôle §5.14' });
      expect(visit.status).toBe(201);

      const hr = await request(app)
        .post('/services/hr/staff')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ profileId: fx.a.teacher.id, jobTitle: 'Vie scolaire §5.14' });
      expect(hr.status).toBe(201);

      // Empty lists OK
      for (const path of [
        '/services/transport/routes',
        '/services/library/items',
        '/services/boarding/rooms',
        '/services/clinic/visits',
        '/services/hr/staff',
      ]) {
        const res = await request(app).get(path).set(auth(fx.a.schoolAdmin.token));
        expect(res.status).toBe(200);
      }
    });
  });
});
