import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * ORG-001 — lien formule ↔ établissement. `PremiumSubscription.institutionId`
 * existait dans le schéma mais n'était jamais renseigné (webhook Stripe
 * ne le portait pas dans ses métadonnées) ni utilisé par
 * `GET /subscriptions/current` (résolution par userId seul) : un
 * abonnement acheté par un membre du personnel était invisible pour tout
 * le reste de son établissement.
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
    // abonnement en interrogeant son propre "current".
    const teacherView = await request(app).get('/subscriptions/current').set(auth(fx.a.teacher.token));
    expect(teacherView.status).toBe(200);
    expect(teacherView.body.subscription?.id).toBe(subscription.id);

    // Un autre établissement ne doit rien voir.
    const otherInstitution = await request(app).get('/subscriptions/current').set(auth(fx.b.teacher.token));
    expect(otherInstitution.status).toBe(200);
    expect(otherInstitution.body.subscription).toBeNull();
  });

  it("à défaut d'abonnement d'établissement, retombe sur l'abonnement personnel de l'appelant", async () => {
    // fx.b n'a reçu aucun abonnement d'établissement dans ce fichier de
    // test : son school_admin ne doit voir que son propre abonnement perso.
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
