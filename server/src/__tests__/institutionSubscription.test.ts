import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { ACTIVE_PLAN_STATUSES, getActivePlan } from '../lib/quotas.js';
import { isFeatureEnabled } from '../lib/featureFlags.js';
import {
  ensureInstitutionSubscription,
} from '../lib/institutionSubscription.js';
import { syncPublicSubscriptionPlans } from '../lib/publicPlans.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

describe('Rattachement établissement → plan défaut (Performance)', () => {
  let fx: Fixture;
  const cleanupInstitutionIds: string[] = [];
  const cleanupSubIds: string[] = [];

  beforeAll(async () => {
    fx = await buildFixture();
    await syncPublicSubscriptionPlans();
  }, 30000);

  afterAll(async () => {
    for (const id of cleanupSubIds) {
      await prisma.premiumSubscription.delete({ where: { id } }).catch(() => {});
    }
    for (const id of cleanupInstitutionIds) {
      await prisma.premiumSubscription.deleteMany({ where: { institutionId: id } }).catch(() => {});
      await prisma.strkInstitution.delete({ where: { id } }).catch(() => {});
    }
  });

  it('rattache un établissement orphelin en trial Performance (dry-run puis apply)', async () => {
    const institution = await prisma.strkInstitution.create({
      data: { name: `Orphelin ${Date.now()}`, type: 'school' },
    });
    cleanupInstitutionIds.push(institution.id);

    const preview = await ensureInstitutionSubscription({
      institutionId: institution.id,
      actorUserId: fx.globalAdmin.id,
      dryRun: true,
      status: 'trial',
    });
    expect(preview.action).toBe('created');
    expect(preview.planName).toMatch(/Performance/i);

    const before = await prisma.premiumSubscription.count({
      where: { institutionId: institution.id },
    });
    expect(before).toBe(0);

    const created = await ensureInstitutionSubscription({
      institutionId: institution.id,
      actorUserId: fx.globalAdmin.id,
      status: 'trial',
    });
    expect(created.action).toBe('created');
    if (created.action === 'created') cleanupSubIds.push(created.subscriptionId);

    const plan = await getActivePlan(institution.id);
    expect(plan?.name).toMatch(/Performance/i);
    expect(await isFeatureEnabled(institution.id, 'advancedReports')).toBe(true);

    const again = await ensureInstitutionSubscription({
      institutionId: institution.id,
      actorUserId: fx.globalAdmin.id,
    });
    expect(again.action).toBe('skipped');
    expect(again.reason).toBe('already_subscribed');
  });

  it('crée un abo trial à la création d’établissement (POST /institutions)', async () => {
    const res = await request(app)
      .post('/institutions')
      .set(auth(fx.globalAdmin.token))
      .send({ name: `AutoPlan ${Date.now()}`, type: 'school' });
    expect(res.status).toBe(201);
    expect(res.body.institution?.id).toBeTruthy();
    cleanupInstitutionIds.push(res.body.institution.id);

    expect(res.body.subscriptionAttach?.action).toBe('created');
    if (res.body.subscriptionAttach?.subscriptionId) {
      cleanupSubIds.push(res.body.subscriptionAttach.subscriptionId);
    }

    const sub = await prisma.premiumSubscription.findFirst({
      where: {
        institutionId: res.body.institution.id,
        status: { in: [...ACTIVE_PLAN_STATUSES] },
      },
      include: { plan_: true },
    });
    expect(sub?.status).toBe('trial');
    expect(sub?.plan_?.name).toMatch(/Performance/i);
  });

  it('backfill dry-run via API puis apply ciblé', async () => {
    const institution = await prisma.strkInstitution.create({
      data: { name: `Backfill ${Date.now()}`, type: 'school' },
    });
    cleanupInstitutionIds.push(institution.id);

    const dry = await request(app)
      .post('/subscriptions/backfill-institutions')
      .set(auth(fx.globalAdmin.token))
      .send({ dryRun: true });
    expect(dry.status).toBe(200);
    expect(dry.body.dryRun).toBe(true);
    expect(dry.body.orphanCount).toBeGreaterThanOrEqual(1);
    expect(dry.body.plan.name).toMatch(/Performance/i);
    expect(
      (dry.body.created as Array<{ institutionId: string }>).some((c) => c.institutionId === institution.id)
    ).toBe(true);

    const stillNone = await prisma.premiumSubscription.count({
      where: { institutionId: institution.id },
    });
    expect(stillNone).toBe(0);

    const created = await ensureInstitutionSubscription({
      institutionId: institution.id,
      actorUserId: fx.globalAdmin.id,
      status: 'trial',
    });
    expect(created.action).toBe('created');
    if (created.action === 'created') cleanupSubIds.push(created.subscriptionId);
  }, 30000);
});
