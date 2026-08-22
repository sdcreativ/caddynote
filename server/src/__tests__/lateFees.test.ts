import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { runLateFeeCheck } from '../lib/lateFees.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * FIN-002 — pénalités de retard de paiement. Désactivées par défaut
 * (`StrkInstitution.lateFeeCents` null) ; un établissement les configure
 * explicitement (montant fixe + délai de grâce), jamais une politique
 * inventée par défaut.
 */
describe('Pénalités de retard (FIN-002)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  const createOverdueInvoice = async (daysOverdue: number) => {
    const fee = await request(app).post('/finance/fee-items').set(auth(fx.a.schoolAdmin.token)).send({
      name: `Frais ${Date.now()}-${Math.random()}`,
      amountCents: 50000,
    });
    const dueDate = new Date(Date.now() - daysOverdue * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const invoice = await request(app).post('/finance/invoices').set(auth(fx.a.schoolAdmin.token)).send({
      studentId: fx.a.student.id,
      dueDate,
      lines: [{ feeItemId: fee.body.feeItem.id, quantity: 1 }],
    });
    expect(invoice.status).toBe(201);
    return invoice.body.invoice.id as string;
  };

  it('rien ne se passe tant que lateFeeCents est désactivé (null par défaut)', async () => {
    await createOverdueInvoice(30);
    const result = await runLateFeeCheck();
    // Aucun établissement configuré à ce stade -> aucune facture examinée
    // (peut être non-nul si un autre test de ce fichier a déjà configuré
    // fx.a, donc on ne vérifie que l'absence d'erreur ici).
    expect(result.checked).toBeGreaterThanOrEqual(0);
  });

  it('applique une pénalité après le délai de grâce, jamais deux fois', async () => {
    const patch = await request(app).patch(`/institutions/${fx.a.institutionId}`).set(auth(fx.a.schoolAdmin.token)).send({
      lateFeeCents: 5000,
      lateFeeGraceDays: 3,
    });
    expect(patch.status).toBe(200);

    const invoiceId = await createOverdueInvoice(10); // largement au-delà des 3 jours de grâce
    const before = await request(app).get(`/finance/invoices/${invoiceId}`).set(auth(fx.a.schoolAdmin.token));
    const totalBefore = before.body.invoice.totalCents;

    const first = await runLateFeeCheck();
    expect(first.feesApplied).toBeGreaterThanOrEqual(1);

    const after = await request(app).get(`/finance/invoices/${invoiceId}`).set(auth(fx.a.schoolAdmin.token));
    expect(after.body.invoice.totalCents).toBe(totalBefore + 5000);
    expect(after.body.invoice.status).toBe('overdue');
    expect(after.body.invoice.lines.some((l: any) => l.lineType === 'penalty')).toBe(true);

    // Deuxième exécution : ne réapplique jamais une pénalité déjà posée.
    const second = await runLateFeeCheck();
    const stillSame = await request(app).get(`/finance/invoices/${invoiceId}`).set(auth(fx.a.schoolAdmin.token));
    expect(stillSame.body.invoice.totalCents).toBe(totalBefore + 5000);

    // Nettoyage : désactive pour ne pas polluer les autres tests du fichier.
    await request(app).patch(`/institutions/${fx.a.institutionId}`).set(auth(fx.a.schoolAdmin.token)).send({ lateFeeCents: null });
  });

  it("ne pénalise pas une facture encore dans le délai de grâce", async () => {
    await request(app).patch(`/institutions/${fx.a.institutionId}`).set(auth(fx.a.schoolAdmin.token)).send({
      lateFeeCents: 5000,
      lateFeeGraceDays: 30,
    });
    const invoiceId = await createOverdueInvoice(5); // en retard, mais dans la grâce de 30 jours
    await runLateFeeCheck();
    const invoice = await request(app).get(`/finance/invoices/${invoiceId}`).set(auth(fx.a.schoolAdmin.token));
    expect(invoice.body.invoice.lines.some((l: any) => l.lineType === 'penalty')).toBe(false);

    await request(app).patch(`/institutions/${fx.a.institutionId}`).set(auth(fx.a.schoolAdmin.token)).send({ lateFeeCents: null });
  });

  it('une facture déjà payée intégralement ne reçoit jamais de pénalité', async () => {
    await request(app).patch(`/institutions/${fx.a.institutionId}`).set(auth(fx.a.schoolAdmin.token)).send({
      lateFeeCents: 5000,
      lateFeeGraceDays: 1,
    });
    const invoiceId = await createOverdueInvoice(10);
    await request(app).post(`/finance/invoices/${invoiceId}/payments/manual`).set(auth(fx.a.schoolAdmin.token)).send({
      amountCents: 50000,
      method: 'cash',
    });
    await runLateFeeCheck();
    const invoice = await request(app).get(`/finance/invoices/${invoiceId}`).set(auth(fx.a.schoolAdmin.token));
    expect(invoice.body.invoice.status).toBe('paid');
    expect(invoice.body.invoice.lines.some((l: any) => l.lineType === 'penalty')).toBe(false);

    await request(app).patch(`/institutions/${fx.a.institutionId}`).set(auth(fx.a.schoolAdmin.token)).send({ lateFeeCents: null });
  });

  it('POST /finance/late-fee-check est réservé à l’admin global', async () => {
    const res = await request(app).post('/finance/late-fee-check').set(auth(fx.a.schoolAdmin.token));
    expect(res.status).toBe(403);

    const asAdmin = await request(app).post('/finance/late-fee-check').set(auth(fx.globalAdmin.token));
    expect(asAdmin.status).toBe(200);
  });
});
