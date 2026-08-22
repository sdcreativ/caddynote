import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, auth, registerActor, type Fixture } from './fixtures.js';

describe('Impersonation auditée time-boxed (ops SaaS)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it('refuse l’impersonation d’un admin global', async () => {
    const otherAdmin = await registerActor('admin');
    const res = await request(app)
      .post('/admin/impersonate')
      .set(auth(fx.globalAdmin.token))
      .send({
        userId: otherAdmin.id,
        durationMinutes: 15,
        reason: 'Test QA — refus admin global attendu',
      });
    expect(res.status).toBe(403);
    expect(String(res.body.error || '')).toMatch(/admin/i);
  });

  it('exige un motif d’impersonation', async () => {
    const res = await request(app)
      .post('/admin/impersonate')
      .set(auth(fx.globalAdmin.token))
      .send({ userId: fx.a.teacher.id, durationMinutes: 15 });
    expect(res.status).toBe(400);
  });

  it('démarre une session time-boxed, bloque le change-password, puis exit restaure l’admin', async () => {
    const start = await request(app)
      .post('/admin/impersonate')
      .set(auth(fx.globalAdmin.token))
      .send({
        userId: fx.a.teacher.id,
        durationMinutes: 15,
        reason: 'Support ticket — vérifier affichage notes enseignant',
      });
    expect(start.status).toBe(200);
    expect(start.body.token).toBeTruthy();
    expect(start.body.impersonatorId).toBe(fx.globalAdmin.id);
    expect(start.body.expiresAt).toBeTruthy();

    const audit = await prisma.strkAuditLog.findFirst({
      where: { action: 'admin.impersonate.start', actorId: fx.globalAdmin.id, targetId: fx.a.teacher.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).toBeTruthy();
    expect((audit?.metadata as { reason?: string } | null)?.reason).toMatch(/Support ticket/);

    const me = await request(app).get('/auth/me').set(auth(start.body.token));
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(fx.a.teacher.id);
    expect(me.body.impersonation?.active).toBe(true);

    const pwd = await request(app)
      .post('/auth/change-password')
      .set(auth(start.body.token))
      .send({ currentPassword: 'Password123!', newPassword: 'Password456!' });
    expect(pwd.status).toBe(403);

    // Exit sans rôle admin sur le JWT cible — ne doit pas être 403 RBAC
    const exit = await request(app).post('/admin/impersonate/exit').set(auth(start.body.token));
    expect(exit.status).toBe(200);
    expect(exit.body.user.id).toBe(fx.globalAdmin.id);
    expect(exit.body.token).toBeTruthy();

    const meAdmin = await request(app).get('/auth/me').set(auth(exit.body.token));
    expect(meAdmin.status).toBe(200);
    expect(meAdmin.body.user.id).toBe(fx.globalAdmin.id);
    expect(meAdmin.body.impersonation?.active).toBeFalsy();
  });

  it('sync-stripe sans stripeSubscriptionId renvoie 422 DB only', async () => {
    const sub = await prisma.premiumSubscription.create({
      data: {
        userId: fx.a.schoolAdmin.id,
        institutionId: fx.a.institutionId,
        plan: 'ops-db-only',
        status: 'active',
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });

    const res = await request(app)
      .post(`/subscriptions/${sub.id}/admin/sync-stripe`)
      .set(auth(fx.globalAdmin.token));
    expect(res.status).toBe(422);
    expect(res.body.mode).toBe('db_only');

    await prisma.premiumSubscription.delete({ where: { id: sub.id } });
  });

  it('billing-metrics et product-telemetry répondent pour l’admin', async () => {
    const bill = await request(app).get('/admin/billing-metrics').set(auth(fx.globalAdmin.token));
    expect(bill.status).toBe(200);
    expect(typeof bill.body.mrr).toBe('number');
    expect(typeof bill.body.churnRate30d).toBe('number');

    const tel = await request(app).get('/admin/product-telemetry?days=7').set(auth(fx.globalAdmin.token));
    expect(tel.status).toBe(200);
    expect(Array.isArray(tel.body.features)).toBe(true);
  });
});
