import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { runSubscriptionSuspensionCheck, isInstitutionSuspended } from '../lib/subscriptionSuspension.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * SAA-004 (Lot 10) — suspension graduée sans destruction de données.
 * `active` → (échéance dépassée) → `grace` → (délai de grâce dépassé) →
 * `suspended` (écritures bloquées, lectures et export toujours possibles —
 * aucune donnée n'est jamais supprimée à aucune étape).
 */
describe('Suspension graduée des abonnements (SAA-004)', () => {
  let fx: Fixture;
  let institutionBSubscriptionId: string;
  const createdSubscriptionIds: string[] = [];

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  afterAll(async () => {
    await prisma.premiumSubscription.deleteMany({ where: { id: { in: createdSubscriptionIds } } });
  });

  const createSubscription = async (institutionId: string, userId: string, data: { status: string; expiresAt: Date }) => {
    const sub = await prisma.premiumSubscription.create({
      data: { userId, institutionId, plan: 'test', status: data.status, expiresAt: data.expiresAt },
    });
    createdSubscriptionIds.push(sub.id);
    return sub;
  };

  it('une souscription active dont l’échéance est dépassée passe en grâce, jamais suspendue immédiatement', async () => {
    const sub = await createSubscription(fx.a.institutionId, fx.a.schoolAdmin.id, {
      status: 'active',
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // hier
    });
    const result = await runSubscriptionSuspensionCheck();
    expect(result.movedToGrace).toBeGreaterThanOrEqual(1);

    const updated = await prisma.premiumSubscription.findUnique({ where: { id: sub.id } });
    expect(updated?.status).toBe('grace');
    expect(await isInstitutionSuspended(fx.a.institutionId)).toBe(false); // en grâce, pas encore suspendu
  });

  it('une souscription en grâce depuis plus de 7 jours est suspendue, sans que rien ne soit supprimé', async () => {
    const sub = await createSubscription(fx.b.institutionId, fx.b.schoolAdmin.id, {
      status: 'grace',
      expiresAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // il y a 10 jours (> 7 jours de grâce)
    });
    institutionBSubscriptionId = sub.id;
    const studentsBefore = await prisma.strkStudent.count({ where: { institutionId: fx.b.institutionId } });

    await runSubscriptionSuspensionCheck();

    const updated = await prisma.premiumSubscription.findUnique({ where: { id: sub.id } });
    expect(updated?.status).toBe('suspended');
    expect(updated?.suspendedAt).not.toBeNull();
    expect(await isInstitutionSuspended(fx.b.institutionId)).toBe(true);

    const studentsAfter = await prisma.strkStudent.count({ where: { institutionId: fx.b.institutionId } });
    expect(studentsAfter).toBe(studentsBefore); // aucune donnée supprimée
  });

  it('un établissement suspendu garde un accès en lecture complet', async () => {
    const res = await request(app).get('/students').set(auth(fx.b.schoolAdmin.token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.students)).toBe(true);
  });

  it('un établissement suspendu ne peut plus créer de compte (écriture bloquée)', async () => {
    const res = await request(app)
      .post('/users')
      .set(auth(fx.b.schoolAdmin.token))
      .send({ email: `bloque.${Date.now()}@suspend.test`, firstName: 'Bloqué', lastName: 'Test', role: 'teacher' });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('lecture seule');
  });

  it('/subscriptions reste accessible en écriture même suspendu (c’est la sortie de la suspension)', async () => {
    const res = await request(app)
      .post('/subscriptions/notifications')
      .set(auth(fx.b.schoolAdmin.token))
      .send({ subscriptionId: institutionBSubscriptionId, userId: fx.b.schoolAdmin.id, notificationType: 'expired' });
    // Ce qui compte : ne pas recevoir le 403 de suspension avant même que la
    // route ne traite la requête (peu importe le résultat métier exact).
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(201);
  });

  it('la reprise (statut à nouveau "active") rétablit immédiatement les écritures', async () => {
    const suspended = await prisma.premiumSubscription.findFirst({ where: { institutionId: fx.b.institutionId, status: 'suspended' } });
    await prisma.premiumSubscription.update({ where: { id: suspended!.id }, data: { status: 'active', suspendedAt: null } });

    const res = await request(app)
      .post('/users')
      .set(auth(fx.b.schoolAdmin.token))
      .send({ email: `retabli.${Date.now()}@suspend.test`, firstName: 'Rétabli', lastName: 'Test', role: 'teacher' });
    expect(res.status).not.toBe(403);
  });
});
