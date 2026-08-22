import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { listDunningQueue, runDunningReminders } from '../lib/dunning.js';
import { checkQuota } from '../lib/quotas.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * §5.13 — Price IDs plans, mutate ops (DB / Stripe gate), dunning, quotas.
 * Les appels Stripe réels restent hors labo (501 / db_only).
 */
describe('Abonnements / Stripe — recette §5.13', () => {
  let fx: Fixture;
  const cleanupPlanIds: string[] = [];
  const cleanupSubIds: string[] = [];

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  afterAll(async () => {
    if (cleanupSubIds.length) {
      await prisma.premiumSubscription.deleteMany({ where: { id: { in: cleanupSubIds } } });
    }
    if (cleanupPlanIds.length) {
      await prisma.subscriptionPlan.deleteMany({ where: { id: { in: cleanupPlanIds } } });
    }
  });

  describe('P0 — Price IDs CRUD plans', () => {
    it('crée / met à jour un plan avec stripePriceId et stripeYearlyPriceId', async () => {
      const created = await request(app)
        .post('/subscriptions/plans')
        .set(auth(fx.globalAdmin.token))
        .send({
          name: `Plan §5.13 ${Date.now()}`,
          priceMonthly: 9900,
          priceYearly: 99000,
          stripePriceId: 'price_test_monthly_513',
          stripeYearlyPriceId: 'price_test_yearly_513',
          maxStudents: 50,
          maxUsers: 20,
          maxSmsPerMonth: 100,
          storageLimitGb: 5,
        });
      expect(created.status).toBe(201);
      expect(created.body.plan.stripePriceId).toBe('price_test_monthly_513');
      expect(created.body.plan.stripeYearlyPriceId).toBe('price_test_yearly_513');
      cleanupPlanIds.push(created.body.plan.id);

      const patched = await request(app)
        .patch(`/subscriptions/plans/${created.body.plan.id}`)
        .set(auth(fx.globalAdmin.token))
        .send({ stripePriceId: 'price_test_monthly_513b' });
      expect(patched.status).toBe(200);
      expect(patched.body.plan.stripePriceId).toBe('price_test_monthly_513b');

      const manage = await request(app).get('/subscriptions/plans/manage').set(auth(fx.globalAdmin.token));
      expect(manage.status).toBe(200);
      expect(manage.body.plans.some((p: { id: string }) => p.id === created.body.plan.id)).toBe(true);
    });

    it('checkout-session refuse sans Stripe ou sans Price ID', async () => {
      const plan = await request(app)
        .post('/subscriptions/plans')
        .set(auth(fx.globalAdmin.token))
        .send({ name: `Sans price ${Date.now()}`, priceMonthly: 1000 });
      cleanupPlanIds.push(plan.body.plan.id);

      const checkout = await request(app)
        .post('/subscriptions/checkout-session')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ planId: plan.body.plan.id, billingCycle: 'monthly' });
      // Garde Stripe d’abord (501) ; avec Stripe OK mais sans price → 400.
      expect([400, 501]).toContain(checkout.status);
    });
  });

  describe('P0 — Mutate ops → Stripe (gate split-brain)', () => {
    it('sans stripeSubscriptionId : suspend/reactivate/change_plan en mode db_only', async () => {
      const planA = await request(app)
        .post('/subscriptions/plans')
        .set(auth(fx.globalAdmin.token))
        .send({ name: `Mutate A ${Date.now()}`, priceMonthly: 1000, maxStudents: 10 });
      const planB = await request(app)
        .post('/subscriptions/plans')
        .set(auth(fx.globalAdmin.token))
        .send({ name: `Mutate B ${Date.now()}`, priceMonthly: 2000, maxStudents: 20 });
      cleanupPlanIds.push(planA.body.plan.id, planB.body.plan.id);

      const sub = await prisma.premiumSubscription.create({
        data: {
          userId: fx.a.schoolAdmin.id,
          institutionId: fx.a.institutionId,
          planId: planA.body.plan.id,
          plan: planA.body.plan.name,
          status: 'active',
          expiresAt: new Date(Date.now() + 30 * 86400000),
        },
      });
      cleanupSubIds.push(sub.id);

      const suspend = await request(app)
        .patch(`/subscriptions/${sub.id}/admin`)
        .set(auth(fx.globalAdmin.token))
        .send({ action: 'suspend' });
      expect(suspend.status).toBe(200);
      expect(suspend.body.mode).toBe('db_only');
      expect(suspend.body.subscription.status).toBe('suspended');

      const reactivate = await request(app)
        .patch(`/subscriptions/${sub.id}/admin`)
        .set(auth(fx.globalAdmin.token))
        .send({ action: 'reactivate' });
      expect(reactivate.status).toBe(200);
      expect(reactivate.body.subscription.status).toBe('active');

      const change = await request(app)
        .patch(`/subscriptions/${sub.id}/admin`)
        .set(auth(fx.globalAdmin.token))
        .send({ action: 'change_plan', planId: planB.body.plan.id });
      expect(change.status).toBe(200);
      expect(change.body.subscription.planId).toBe(planB.body.plan.id);
      expect(change.body.mode).toBe('db_only');
    });

    it('avec stripeSubscriptionId sans Stripe configuré → 501 (pas de write-back local)', async () => {
      const sub = await prisma.premiumSubscription.create({
        data: {
          userId: fx.a.schoolAdmin.id,
          institutionId: fx.a.institutionId,
          plan: 'stripe-linked',
          status: 'active',
          expiresAt: new Date(Date.now() + 30 * 86400000),
          stripeSubscriptionId: 'sub_test_fake_513',
        },
      });
      cleanupSubIds.push(sub.id);

      const res = await request(app)
        .patch(`/subscriptions/${sub.id}/admin`)
        .set(auth(fx.globalAdmin.token))
        .send({ action: 'suspend' });
      expect(res.status).toBe(501);
      expect(res.body.mode).toBe('stripe_required');

      const still = await prisma.premiumSubscription.findUnique({ where: { id: sub.id } });
      expect(still?.status).toBe('active');
    });
  });

  describe('P1 — Dunning automatisé', () => {
    it('file dunning + run + nudge admin', async () => {
      const sub = await prisma.premiumSubscription.create({
        data: {
          userId: fx.a.schoolAdmin.id,
          institutionId: fx.a.institutionId,
          plan: 'grace-dunning',
          status: 'grace',
          expiresAt: new Date(Date.now() - 3 * 86400000), // J+3 → eligible J+2
          expirationNotificationsSent: [],
        },
      });
      cleanupSubIds.push(sub.id);

      const queue = await listDunningQueue();
      expect(queue.some((q) => q.subscriptionId === sub.id)).toBe(true);

      const httpQueue = await request(app).get('/admin/dunning-queue').set(auth(fx.globalAdmin.token));
      expect(httpQueue.status).toBe(200);
      const items = httpQueue.body.items ?? httpQueue.body.queue ?? httpQueue.body;
      expect(Array.isArray(items)).toBe(true);
      expect(items.some((q: { subscriptionId: string }) => q.subscriptionId === sub.id)).toBe(true);

      const run = await runDunningReminders();
      expect(run.nudged).toBeGreaterThanOrEqual(0);

      const nudge = await request(app)
        .post(`/subscriptions/${sub.id}/admin/dunning-nudge`)
        .set(auth(fx.globalAdmin.token))
        .send({});
      expect(nudge.status).toBe(200);

      const denied = await request(app)
        .post(`/subscriptions/${sub.id}/admin/dunning-nudge`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({});
      expect(denied.status).toBe(403);
    });
  });

  describe('P1 — Quotas plan appliqués', () => {
    it('plafond élèves du plan bloque une création (users/SMS/storage exposés)', async () => {
      const plan = await prisma.subscriptionPlan.create({
        data: {
          name: `Quota §5.13 ${Date.now()}`,
          priceMonthly: 0,
          maxStudents: 1,
          maxUsers: 10,
          maxSmsPerMonth: 5,
          storageLimitGb: 1,
        },
      });
      cleanupPlanIds.push(plan.id);
      const sub = await prisma.premiumSubscription.create({
        data: {
          userId: fx.a.schoolAdmin.id,
          institutionId: fx.a.institutionId,
          planId: plan.id,
          plan: plan.name,
          status: 'active',
          expiresAt: new Date(Date.now() + 30 * 86400000),
        },
      });
      cleanupSubIds.push(sub.id);

      // Fixture a déjà 1 élève → quota atteint
      const students = await checkQuota(fx.a.institutionId, 'students');
      expect(students.limit).toBe(1);
      expect(students.allowed).toBe(false);

      const sms = await checkQuota(fx.a.institutionId, 'smsPerMonth', 0);
      expect(sms.limit).toBe(5);

      const storage = await checkQuota(fx.a.institutionId, 'storageGb', 0);
      expect(storage.limit).toBe(1);

      const createStudent = await request(app)
        .post('/users')
        .set(auth(fx.a.schoolAdmin.token))
        .send({
          email: `quota513.${Date.now()}@test.caddynote`,
          firstName: 'Trop',
          lastName: 'Élèves',
          role: 'student',
        });
      expect(createStudent.status).toBe(403);
    });
  });
});
