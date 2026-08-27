import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * ORG-001 — lien formule ↔ établissement.
 * Depuis le rattachement auto au plan défaut, chaque établissement de fixture
 * a déjà un abo trial : les assertions portent sur l’isolation cross-tenant
 * et le fallback perso quand aucun abo d’établissement n’existe.
 */
describe('Lien abonnement ↔ établissement (ORG-001)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it("un abonnement rattaché à l'établissement est visible par tout le personnel, pas seulement l'acheteur", async () => {
    const subscription = await prisma.premiumSubscription.create({
      data: {
        userId: fx.a.schoolAdmin.id,
        institutionId: fx.a.institutionId,
        plan: 'test-plan',
        status: 'active',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    // Le personnel de l'établissement (pas l'acheteur) doit voir cet
    // abonnement en interrogeant son propre "current" (le plus récent).
    const teacherView = await request(app).get('/subscriptions/current').set(auth(fx.a.teacher.token));
    expect(teacherView.status).toBe(200);
    expect(teacherView.body.subscription?.id).toBe(subscription.id);

    // Un autre établissement voit son propre abo (ex. trial auto), jamais celui du tenant A.
    const otherInstitution = await request(app).get('/subscriptions/current').set(auth(fx.b.teacher.token));
    expect(otherInstitution.status).toBe(200);
    expect(otherInstitution.body.subscription?.id).not.toBe(subscription.id);
    expect(otherInstitution.body.subscription?.institutionId).toBe(fx.b.institutionId);
  });

  it("à défaut d'abonnement d'établissement, retombe sur l'abonnement personnel de l'appelant", async () => {
    // Retirer les abos liés à l’établissement (dont le trial auto à la création)
    // pour exercer le fallback userId-only.
    await prisma.premiumSubscription.deleteMany({ where: { institutionId: fx.b.institutionId } });

    const soloAdmin = await prisma.premiumSubscription.create({
      data: {
        userId: fx.b.schoolAdmin.id,
        plan: 'perso',
        status: 'active',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const res = await request(app).get('/subscriptions/current').set(auth(fx.b.schoolAdmin.token));
    expect(res.status).toBe(200);
    expect(res.body.subscription?.id).toBe(soloAdmin.id);
  });
});
