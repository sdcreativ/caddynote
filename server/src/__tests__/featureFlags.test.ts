import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { isFeatureEnabled } from '../lib/featureFlags.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * SAA-005 (Lot 10) — feature flags par formule/tenant/pilote.
 * `SubscriptionPlan.features` porte les valeurs par défaut d'un plan ;
 * `StrkInstitution.featureOverrides` (nouveau) porte les exceptions propres
 * à un établissement — activées ni par le plan, ni par aucun mécanisme
 * existant auparavant.
 */
describe('Feature flags (SAA-005)', () => {
  let fx: Fixture;
  let planId: string;
  let subscriptionId: string;

  beforeAll(async () => {
    fx = await buildFixture();
    const plan = await prisma.subscriptionPlan.create({
      data: { name: `Plan features ${Date.now()}`, priceMonthly: 0, features: { advancedReports: true } },
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

  it('reprend la valeur par défaut du plan quand aucune surcharge n’existe', async () => {
    expect(await isFeatureEnabled(fx.a.institutionId, 'advancedReports')).toBe(true);
    expect(await isFeatureEnabled(fx.a.institutionId, 'aiTutor')).toBe(false); // alias → exercises_ai absent
    expect(await isFeatureEnabled(fx.a.institutionId, 'exercises_ai')).toBe(false);
  });

  it('une surcharge tenant active une fonctionnalité absente du plan (pilote)', async () => {
    const res = await request(app)
      .put(`/institutions/${fx.a.institutionId}/features/aiTutor`)
      .set(auth(fx.globalAdmin.token))
      .send({ enabled: true });
    expect(res.status).toBe(200);
    // Stockage canonique exercises_ai (alias aiTutor)
    expect(res.body.overrides.exercises_ai).toBe(true);
    expect(res.body.overrides.aiTutor).toBeUndefined();

    expect(await isFeatureEnabled(fx.a.institutionId, 'aiTutor')).toBe(true);
    expect(await isFeatureEnabled(fx.a.institutionId, 'exercises_ai')).toBe(true);
    // Le reste du plan n'est pas affecté par cette surcharge ponctuelle.
    expect(await isFeatureEnabled(fx.a.institutionId, 'advancedReports')).toBe(true);
  });

  it('une surcharge tenant peut aussi désactiver une fonctionnalité incluse dans le plan', async () => {
    await request(app)
      .put(`/institutions/${fx.a.institutionId}/features/advancedReports`)
      .set(auth(fx.globalAdmin.token))
      .send({ enabled: false });

    expect(await isFeatureEnabled(fx.a.institutionId, 'advancedReports')).toBe(false);
  });

  it('retirer la surcharge (enabled: null) fait retomber sur la valeur du plan', async () => {
    await request(app)
      .put(`/institutions/${fx.a.institutionId}/features/advancedReports`)
      .set(auth(fx.globalAdmin.token))
      .send({ enabled: null });

    expect(await isFeatureEnabled(fx.a.institutionId, 'advancedReports')).toBe(true); // retombe sur le plan
  });

  it('un établissement différent n’est jamais affecté par les surcharges d’un autre (ORG-004)', async () => {
    expect(await isFeatureEnabled(fx.b.institutionId, 'aiTutor')).toBe(false);
  });

  it('la modification des surcharges est réservée à l’admin global', async () => {
    const res = await request(app)
      .put(`/institutions/${fx.a.institutionId}/features/aiTutor`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ enabled: true });
    expect(res.status).toBe(403);
  });

  it('GET /institutions/:id/features est accessible au personnel de l’établissement', async () => {
    const res = await request(app).get(`/institutions/${fx.a.institutionId}/features`).set(auth(fx.a.schoolAdmin.token));
    expect(res.status).toBe(200);
    expect(res.body.overrides.exercises_ai).toBe(true);
    expect(res.body.effective?.exercises_ai).toBe(true);
    expect(res.body.platformFlags).toBeDefined();
  });

  it('requireFeature bloque communications / analytics avancés / cantine quand le flag est off', async () => {
    await request(app)
      .put(`/institutions/${fx.a.institutionId}/features/communications`)
      .set(auth(fx.globalAdmin.token))
      .send({ enabled: false });
    await request(app)
      .put(`/institutions/${fx.a.institutionId}/features/advancedReports`)
      .set(auth(fx.globalAdmin.token))
      .send({ enabled: false });
    await request(app)
      .put(`/institutions/${fx.a.institutionId}/features/canteen`)
      .set(auth(fx.globalAdmin.token))
      .send({ enabled: false });

    const templates = await request(app)
      .get('/communications/templates')
      .set(auth(fx.a.schoolAdmin.token));
    expect(templates.status).toBe(403);
    expect(templates.body.code).toBe('feature_disabled');

    // Préférences personnelles restent accessibles.
    const prefs = await request(app)
      .get('/communications/preferences')
      .set(auth(fx.a.schoolAdmin.token));
    expect(prefs.status).toBe(200);

    const academic = await request(app)
      .get(`/analytics/academic-metrics?institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(academic.status).toBe(403);
    expect(academic.body.code).toBe('feature_disabled');

    const canteen = await request(app)
      .get('/services/canteen/plans')
      .set(auth(fx.a.schoolAdmin.token));
    expect(canteen.status).toBe(403);
    expect(canteen.body.code).toBe('feature_disabled');

    // Export basique non bloqué par advancedReports.
    const exportRes = await request(app)
      .get(`/reports/export?type=students&institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(exportRes.status).not.toBe(403);

    // Restaurer pour ne pas polluer d'autres suites éventuelles.
    await request(app)
      .put(`/institutions/${fx.a.institutionId}/features/communications`)
      .set(auth(fx.globalAdmin.token))
      .send({ enabled: null });
    await request(app)
      .put(`/institutions/${fx.a.institutionId}/features/advancedReports`)
      .set(auth(fx.globalAdmin.token))
      .send({ enabled: null });
    await request(app)
      .put(`/institutions/${fx.a.institutionId}/features/canteen`)
      .set(auth(fx.globalAdmin.token))
      .send({ enabled: null });
  });
});
