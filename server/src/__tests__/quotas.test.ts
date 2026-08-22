import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { checkQuota, getQuotaOverview } from '../lib/quotas.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * SAA-003 (Lot 10) — quotas (élèves, utilisateurs, SMS) avec blocage réel
 * une fois le plafond atteint. Les champs de quota existaient déjà sur
 * `SubscriptionPlan` mais n'étaient lus nulle part : aucune limite n'était
 * jamais appliquée, quel que soit le plan souscrit.
 */
describe('Quotas SaaS (SAA-003)', () => {
  let fx: Fixture;
  let planId: string;
  let subscriptionId: string;

  beforeAll(async () => {
    fx = await buildFixture();
    const plan = await prisma.subscriptionPlan.create({
      data: { name: `Plan test ${Date.now()}`, priceMonthly: 0, maxStudents: 1, maxUsers: 4, maxSmsPerMonth: 2 },
    });
    planId = plan.id;
    const subscription = await prisma.premiumSubscription.create({
      data: {
        userId: fx.a.schoolAdmin.id,
        institutionId: fx.a.institutionId,
        planId,
        plan: plan.name,
        status: 'active',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    subscriptionId = subscription.id;
  }, 30000);

  afterAll(async () => {
    await prisma.premiumSubscription.delete({ where: { id: subscriptionId } }).catch(() => {});
    await prisma.subscriptionPlan.delete({ where: { id: planId } }).catch(() => {});
  });

  it('sans abonnement actif, aucune limite ne s’applique (illimité)', async () => {
    const status = await checkQuota(fx.b.institutionId, 'students');
    expect(status.limit).toBeNull();
    expect(status.allowed).toBe(true);
  });

  it('reflète le plafond réel du plan et détecte l’avertissement avant le blocage', async () => {
    // maxUsers = 4 ; le fixture a déjà schoolAdmin + teacher + student = 3
    // comptes existants. Une 4e création (additional=1, valeur par défaut)
    // reste juste en dessous du plafond (3+1<=4) mais franchit déjà 80%.
    const status = await checkQuota(fx.a.institutionId, 'users');
    expect(status.limit).toBe(4);
    expect(status.current).toBe(3);
    expect(status.allowed).toBe(true);
    expect(status.warning).toBe(true); // (3+1)/4 = 100% >= 80%
  });

  it('bloque la création d’un compte au-delà du plafond (POST /users)', async () => {
    // maxStudents = 1 ; le fixture a déjà 1 élève -> le prochain doit être refusé.
    const res = await request(app)
      .post('/users')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ email: `eleve.${Date.now()}@quota.test`, firstName: 'Trop', lastName: 'Nombreux', role: 'student' });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('élèves');
  });

  it('bloque un import CSV qui dépasserait le quota élèves, avant toute création', async () => {
    const csv = 'firstName,lastName,email\nA,B,a.b.quota@test.com\nC,D,c.d.quota@test.com\n';
    const res = await request(app)
      .post('/students/import')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ csv, institutionId: fx.a.institutionId });
    expect(res.status).toBe(403);

    // Aucune ligne ne doit avoir été importée malgré le refus global.
    const created = await prisma.strkProfile.findUnique({ where: { email: 'a.b.quota@test.com' } });
    expect(created).toBeNull();
  });

  it('GET /institutions/:id/quotas renvoie une vue d’ensemble réelle des quotas', async () => {
    const res = await request(app).get(`/institutions/${fx.a.institutionId}/quotas`).set(auth(fx.a.schoolAdmin.token));
    expect(res.status).toBe(200);
    expect(res.body.quotas.length).toBeGreaterThanOrEqual(4);
    const students = res.body.quotas.find((q: any) => q.type === 'students');
    expect(students.limit).toBe(1);
    expect(res.body.quotas.some((q: any) => q.type === 'aiPerMonth')).toBe(true);
  });

  it('getQuotaOverview() correspond aux vérifications individuelles (additional=0)', async () => {
    const overview = await getQuotaOverview(fx.a.institutionId);
    const individual = await Promise.all([
      checkQuota(fx.a.institutionId, 'students', 0),
      checkQuota(fx.a.institutionId, 'users', 0),
      checkQuota(fx.a.institutionId, 'smsPerMonth', 0),
      checkQuota(fx.a.institutionId, 'storageGb', 0),
      checkQuota(fx.a.institutionId, 'aiPerMonth', 0),
    ]);
    expect(overview).toEqual(individual);
  });
});
