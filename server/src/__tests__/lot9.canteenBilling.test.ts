import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';
import { prisma } from '../lib/prisma.js';

describe('Lot 9 — cantine facturation + parent (S1)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it('subscribe payant crée une facture ; gratuit non ; backfill 409', async () => {
    const paid = await request(app)
      .post('/services/canteen/plans')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ name: `Cantine-pay-${Date.now()}`, priceCents: 1500000, currency: 'XOF' });
    expect(paid.status).toBe(201);
    const planId = paid.body.plan.id as string;

    const sub = await request(app)
      .post(`/services/canteen/plans/${planId}/subscribe`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ studentId: fx.a.student.id });
    expect(sub.status).toBe(201);
    expect(sub.body.subscription.invoiceId).toBeTruthy();
    expect(sub.body.invoice).toMatchObject({
      totalCents: 1500000,
      studentId: fx.a.student.id,
      institutionId: fx.a.institutionId,
    });
    expect(sub.body.invoice.invoiceNumber).toMatch(/^INV-/);

    const invoice = await prisma.strkInvoice.findUnique({
      where: { id: sub.body.invoice.id },
      include: { lines: true },
    });
    expect(invoice?.lines).toHaveLength(1);
    expect(invoice?.lines[0].label).toMatch(/Cantine/i);

    const again = await request(app)
      .post(`/services/canteen/subscriptions/${sub.body.subscription.id}/invoice`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({});
    expect(again.status).toBe(409);

    const free = await request(app)
      .post('/services/canteen/plans')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ name: `Cantine-free-${Date.now()}`, priceCents: 0 });
    expect(free.status).toBe(201);

    // autre élève pour éviter conflit d’abo sur même plan payant déjà souscrit
    const freeSub = await request(app)
      .post(`/services/canteen/plans/${free.body.plan.id}/subscribe`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ studentId: fx.a.student.id });
    // student already on paid plan is OK on another plan
    expect(freeSub.status).toBe(201);
    expect(freeSub.body.invoice).toBeNull();
    expect(freeSub.body.subscription.invoiceId).toBeNull();
  });

  it('parent /services/mine voit son enfant ; staff 403 ; pas l’élève du tenant B', async () => {
    const route = await request(app)
      .post('/services/transport/routes')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ name: `Parent-bus-${Date.now()}`, capacity: 10 });
    expect(route.status).toBe(201);
    await request(app)
      .post(`/services/transport/routes/${route.body.route.id}/enroll`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ studentId: fx.a.student.id });

    const mine = await request(app).get('/services/mine').set(auth(fx.parentA.token));
    expect(mine.status).toBe(200);
    const child = (mine.body.children as { studentId: string; transportEnrollments: unknown[] }[]).find(
      (c) => c.studentId === fx.a.student.id
    );
    expect(child).toBeTruthy();
    expect(child!.transportEnrollments.length).toBeGreaterThanOrEqual(1);
    expect(
      (mine.body.children as { studentId: string }[]).some((c) => c.studentId === fx.b.student.id)
    ).toBe(false);

    const staff = await request(app).get('/services/mine').set(auth(fx.a.schoolAdmin.token));
    expect(staff.status).toBe(403);
  });
});
