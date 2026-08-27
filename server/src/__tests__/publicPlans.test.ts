import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { getActivePlan } from '../lib/quotas.js';
import { isFeatureEnabled } from '../lib/featureFlags.js';
import { syncPublicSubscriptionPlans, PUBLIC_PLAN_DEFAULTS } from '../lib/publicPlans.js';
import { buildFixture, type Fixture } from './fixtures.js';

describe('Catalogue public + plan actif (mix entitlements)', () => {
  let fx: Fixture;
  const createdPlanIds: string[] = [];
  const createdSubIds: string[] = [];

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  afterAll(async () => {
    for (const id of createdSubIds) {
      await prisma.premiumSubscription.delete({ where: { id } }).catch(() => {});
    }
    for (const id of createdPlanIds) {
      await prisma.subscriptionPlan.delete({ where: { id } }).catch(() => {});
    }
  });

  it('synchronise entitlements + quotas soft sur Essentiel / Performance / Réseau', async () => {
    const first = await syncPublicSubscriptionPlans();
    expect(first.synced).toBeGreaterThanOrEqual(3);

    const second = await syncPublicSubscriptionPlans();
    expect(second.seeded).toBe(false);
    expect(second.synced).toBe(3);

    const performance = await prisma.subscriptionPlan.findFirst({
      where: { name: 'Performance' },
    });
    expect(performance).toBeTruthy();
    const perfFeatures = performance!.features as Record<string, unknown>;
    expect(perfFeatures.advancedReports).toBe(true);
    expect(perfFeatures.finance).toBe(true);
    expect(Array.isArray(perfFeatures.featureList)).toBe(true);

    const essentiel = await prisma.subscriptionPlan.findFirst({ where: { name: 'Essentiel' } });
    expect(essentiel?.maxSmsPerMonth).toBe(100);
    expect(essentiel?.maxStudents).toBe(400);
    const essFeatures = essentiel!.features as Record<string, unknown>;
    expect(essFeatures.advancedReports).toBe(false);

    const reseau = await prisma.subscriptionPlan.findFirst({ where: { name: 'Réseau' } });
    const reseauList = (reseau!.features as { featureList?: string[] }).featureList || [];
    expect(reseauList.some((f) => /consolidée des effectifs/i.test(f))).toBe(true);
    expect(reseauList.some((f) => /Consolidation financière/i.test(f))).toBe(false);
    expect(PUBLIC_PLAN_DEFAULTS).toHaveLength(3);
  });

  it('applique le plan en statut trial (pas seulement active)', async () => {
    const plan = await prisma.subscriptionPlan.create({
      data: {
        name: `Plan trial ${Date.now()}`,
        priceMonthly: 0,
        features: { advancedReports: true, finance: true },
      },
    });
    createdPlanIds.push(plan.id);

    const sub = await prisma.premiumSubscription.create({
      data: {
        userId: fx.b.schoolAdmin.id,
        institutionId: fx.b.institutionId,
        planId: plan.id,
        plan: plan.name,
        status: 'trial',
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });
    createdSubIds.push(sub.id);

    const active = await getActivePlan(fx.b.institutionId);
    expect(active?.id).toBe(plan.id);
    expect(await isFeatureEnabled(fx.b.institutionId, 'advancedReports')).toBe(true);
  });
});
