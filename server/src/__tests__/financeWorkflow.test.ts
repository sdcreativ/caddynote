import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * §5.8 — gate flag `finance`, recette facturation/encaissement/relances
 * (pénalités), et boucle courte de rapprochement (complète `bankReconciliation`).
 */
describe('Finance — flag, facturation, rapprochement (§5.8)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  afterAll(async () => {
    await request(app)
      .put(`/institutions/${fx.a.institutionId}/features/finance`)
      .set(auth(fx.globalAdmin.token))
      .send({ enabled: null });
    await prisma.strkSetting
      .deleteMany({ where: { category: 'system', key: 'platformFlags' } })
      .catch(() => {});
  });

  describe('P0 — gate flag finance', () => {
    it('flag tenant off → 403 feature_disabled sur /finance/* authentifié', async () => {
      await request(app)
        .put(`/institutions/${fx.a.institutionId}/features/finance`)
        .set(auth(fx.globalAdmin.token))
        .send({ enabled: false });

      const res = await request(app)
        .get(`/finance/invoices?institutionId=${fx.a.institutionId}`)
        .set(auth(fx.a.schoolAdmin.token));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('feature_disabled');
      expect(res.body.feature).toBe('finance');

      await request(app)
        .put(`/institutions/${fx.a.institutionId}/features/finance`)
        .set(auth(fx.globalAdmin.token))
        .send({ enabled: null });
    });

    it('flag plateforme finance=false prime sur le défaut ON du module', async () => {
      await request(app)
        .put('/settings/system/platformFlags')
        .set(auth(fx.globalAdmin.token))
        .send({ value: { finance: false }, description: 'test §5.8' });

      const res = await request(app)
        .get(`/finance/fee-items?institutionId=${fx.a.institutionId}`)
        .set(auth(fx.a.schoolAdmin.token));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('feature_disabled');

      // Webhook public reste accessible (pas derrière requireFeature).
      const webhook = await request(app).post('/finance/webhooks/cinetpay').send({});
      expect(webhook.status).not.toBe(401);
      expect(webhook.status).not.toBe(403);

      await request(app)
        .put('/settings/system/platformFlags')
        .set(auth(fx.globalAdmin.token))
        .send({ value: {}, description: 'reset §5.8' });
    });
  });

  describe('§12 — RBAC lecture factures', () => {
    it('enseignant ne liste pas les factures établissement ni par élève', async () => {
      const byInst = await request(app)
        .get(`/finance/invoices?institutionId=${fx.a.institutionId}`)
        .set(auth(fx.a.teacher.token));
      expect(byInst.status).toBe(403);

      const byStudent = await request(app)
        .get(`/finance/invoices?studentId=${fx.a.student.id}`)
        .set(auth(fx.a.teacher.token));
      expect(byStudent.status).toBe(403);
    });

    it('school_admin liste les factures établissement', async () => {
      const res = await request(app)
        .get(`/finance/invoices?institutionId=${fx.a.institutionId}`)
        .set(auth(fx.a.schoolAdmin.token));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.invoices)).toBe(true);
    });
  });

  describe('P1 — facturation / encaissement / relances (pénalités)', () => {
    it('parcours : frais → facture → lecture parent → paiement manuel → paid', async () => {
      const fee = await request(app).post('/finance/fee-items').set(auth(fx.a.schoolAdmin.token)).send({
        institutionId: fx.a.institutionId,
        name: `Scolarité ${Date.now()}`,
        amountCents: 150000,
      });
      expect(fee.status).toBe(201);

      const invoice = await request(app).post('/finance/invoices').set(auth(fx.a.schoolAdmin.token)).send({
        institutionId: fx.a.institutionId,
        studentId: fx.a.student.id,
        lines: [{ feeItemId: fee.body.feeItem.id, quantity: 1 }],
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      });
      expect(invoice.status).toBe(201);
      const invoiceId = invoice.body.invoice.id as string;
      expect(invoice.body.invoice.totalCents).toBe(150000);

      const asParent = await request(app)
        .get(`/finance/invoices?studentId=${fx.a.student.id}`)
        .set(auth(fx.parentA.token));
      expect(asParent.status).toBe(200);
      expect(asParent.body.invoices.some((i: { id: string }) => i.id === invoiceId)).toBe(true);

      const pay = await request(app)
        .post(`/finance/invoices/${invoiceId}/payments/manual`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ amountCents: 150000, method: 'cash' });
      expect(pay.status).toBe(201);

      const after = await request(app).get(`/finance/invoices/${invoiceId}`).set(auth(fx.a.schoolAdmin.token));
      expect(after.status).toBe(200);
      expect(after.body.invoice.status).toBe('paid');
      expect(after.body.invoice.paidCents).toBe(150000);
    });

    it('manual-multi : 1 paiement → 2 factures + isolation tenant', async () => {
      const fee1 = await request(app).post('/finance/fee-items').set(auth(fx.a.schoolAdmin.token)).send({
        name: `Multi A ${Date.now()}`,
        amountCents: 40000,
      });
      const fee2 = await request(app).post('/finance/fee-items').set(auth(fx.a.schoolAdmin.token)).send({
        name: `Multi B ${Date.now()}`,
        amountCents: 60000,
      });
      const inv1 = await request(app).post('/finance/invoices').set(auth(fx.a.schoolAdmin.token)).send({
        studentId: fx.a.student.id,
        lines: [{ feeItemId: fee1.body.feeItem.id, quantity: 1 }],
      });
      const inv2 = await request(app).post('/finance/invoices').set(auth(fx.a.schoolAdmin.token)).send({
        studentId: fx.a.student.id,
        lines: [{ feeItemId: fee2.body.feeItem.id, quantity: 1 }],
      });
      expect(inv1.status).toBe(201);
      expect(inv2.status).toBe(201);

      const multi = await request(app)
        .post('/finance/payments/manual-multi')
        .set(auth(fx.a.schoolAdmin.token))
        .send({
          method: 'cash',
          allocations: [
            { invoiceId: inv1.body.invoice.id, amountCents: 40000 },
            { invoiceId: inv2.body.invoice.id, amountCents: 60000 },
          ],
        });
      expect(multi.status).toBe(201);
      expect(multi.body.payment.amountCents).toBe(100000);
      expect(multi.body.allocations).toHaveLength(2);

      const after1 = await request(app)
        .get(`/finance/invoices/${inv1.body.invoice.id}`)
        .set(auth(fx.a.schoolAdmin.token));
      const after2 = await request(app)
        .get(`/finance/invoices/${inv2.body.invoice.id}`)
        .set(auth(fx.a.schoolAdmin.token));
      expect(after1.body.invoice.status).toBe('paid');
      expect(after2.body.invoice.status).toBe('paid');

      const overpay = await request(app)
        .post('/finance/payments/manual-multi')
        .set(auth(fx.a.schoolAdmin.token))
        .send({
          method: 'cash',
          allocations: [{ invoiceId: inv1.body.invoice.id, amountCents: 1 }],
        });
      expect(overpay.status).toBe(400);

      if (fx.b?.institutionId && fx.b?.schoolAdmin?.token && fx.b?.student?.id) {
        const feeB = await request(app).post('/finance/fee-items').set(auth(fx.b.schoolAdmin.token)).send({
          name: `Other tenant ${Date.now()}`,
          amountCents: 10000,
        });
        const invB = await request(app).post('/finance/invoices').set(auth(fx.b.schoolAdmin.token)).send({
          studentId: fx.b.student.id,
          lines: [{ feeItemId: feeB.body.feeItem.id, quantity: 1 }],
        });
        const steal = await request(app)
          .post('/finance/payments/manual-multi')
          .set(auth(fx.a.schoolAdmin.token))
          .send({
            method: 'cash',
            allocations: [{ invoiceId: invB.body.invoice.id, amountCents: 10000 }],
          });
        expect([403, 404]).toContain(steal.status);
      }
    });

    it('avoir + parrainage imputés sur facture', async () => {
      const fee = await request(app).post('/finance/fee-items').set(auth(fx.a.schoolAdmin.token)).send({
        name: `Credit ${Date.now()}`,
        amountCents: 50000,
      });
      const invoice = await request(app).post('/finance/invoices').set(auth(fx.a.schoolAdmin.token)).send({
        studentId: fx.a.student.id,
        lines: [{ feeItemId: fee.body.feeItem.id, quantity: 1 }],
      });
      const invoiceId = invoice.body.invoice.id as string;

      const note = await request(app).post('/finance/credit-notes').set(auth(fx.a.schoolAdmin.token)).send({
        studentId: fx.a.student.id,
        amountCents: 20000,
        reason: 'Trop-perçu test',
      });
      expect(note.status).toBe(201);

      const applyNote = await request(app)
        .post(`/finance/credit-notes/${note.body.creditNote.id}/apply`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ invoiceId, amountCents: 20000 });
      expect(applyNote.status).toBe(201);

      const mid = await request(app).get(`/finance/invoices/${invoiceId}`).set(auth(fx.a.schoolAdmin.token));
      expect(mid.body.invoice.creditAppliedCents).toBe(20000);
      expect(mid.body.invoice.status).toBe('partially_paid');

      const sponsorship = await request(app).post('/finance/sponsorships').set(auth(fx.a.schoolAdmin.token)).send({
        studentId: fx.a.student.id,
        sponsorName: 'ONG Test',
        sponsorType: 'ngo',
        amountCents: 30000,
      });
      expect(sponsorship.status).toBe(201);

      const applySp = await request(app)
        .post(`/finance/sponsorships/${sponsorship.body.sponsorship.id}/apply`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ invoiceId, amountCents: 30000 });
      expect(applySp.status).toBe(201);

      const done = await request(app).get(`/finance/invoices/${invoiceId}`).set(auth(fx.a.schoolAdmin.token));
      expect(done.body.invoice.creditAppliedCents).toBe(50000);
      expect(done.body.invoice.status).toBe('paid');
    });

    it('relance pénalité : facture échue → late-fee-check → ligne penalty + overdue', async () => {
      await prisma.strkInstitution.update({
        where: { id: fx.a.institutionId },
        data: { lateFeeCents: 5000, lateFeeGraceDays: 0 },
      });

      const fee = await request(app).post('/finance/fee-items').set(auth(fx.a.schoolAdmin.token)).send({
        institutionId: fx.a.institutionId,
        name: `Retard ${Date.now()}`,
        amountCents: 80000,
      });
      const invoice = await request(app).post('/finance/invoices').set(auth(fx.a.schoolAdmin.token)).send({
        institutionId: fx.a.institutionId,
        studentId: fx.a.student.id,
        lines: [{ feeItemId: fee.body.feeItem.id, quantity: 1 }],
        dueDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      });
      const invoiceId = invoice.body.invoice.id as string;

      const check = await request(app).post('/finance/late-fee-check').set(auth(fx.globalAdmin.token));
      expect(check.status).toBe(200);
      expect(check.body.feesApplied).toBeGreaterThanOrEqual(1);

      const after = await request(app).get(`/finance/invoices/${invoiceId}`).set(auth(fx.a.schoolAdmin.token));
      expect(after.body.invoice.status).toBe('overdue');
      expect(after.body.invoice.totalCents).toBe(85000);
      expect(after.body.invoice.lines.some((l: { lineType: string }) => l.lineType === 'penalty')).toBe(true);

      await prisma.strkInstitution.update({
        where: { id: fx.a.institutionId },
        data: { lateFeeCents: null, lateFeeGraceDays: 7 },
      });
    });
  });

  describe('P2 — rapprochement bancaire (bout-en-bout court)', () => {
    it('import → auto-match unique → summary matched', async () => {
      const amountCents = 600000 + Math.floor(Math.random() * 50000);
      const fee = await request(app).post('/finance/fee-items').set(auth(fx.a.schoolAdmin.token)).send({
        institutionId: fx.a.institutionId,
        name: `Bank ${amountCents}`,
        amountCents,
      });
      const invoice = await request(app).post('/finance/invoices').set(auth(fx.a.schoolAdmin.token)).send({
        institutionId: fx.a.institutionId,
        studentId: fx.a.student.id,
        lines: [{ feeItemId: fee.body.feeItem.id, quantity: 1 }],
      });
      const pay = await request(app)
        .post(`/finance/invoices/${invoice.body.invoice.id}/payments/manual`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ amountCents, method: 'bank_transfer' });
      expect(pay.status).toBe(201);

      const today = new Date().toISOString().slice(0, 10);
      const imported = await request(app).post('/finance/bank-statement/import').set(auth(fx.a.schoolAdmin.token)).send({
        institutionId: fx.a.institutionId,
        lines: [{ date: today, amountCents, label: `VIR ${amountCents}` }],
      });
      expect(imported.status).toBe(201);
      expect(imported.body.autoMatched).toBeGreaterThanOrEqual(1);

      const matched = await request(app)
        .get(`/finance/bank-statement/lines?institutionId=${fx.a.institutionId}&status=matched`)
        .set(auth(fx.a.schoolAdmin.token));
      expect(matched.status).toBe(200);
      expect(matched.body.lines.some((l: { amountCents: number }) => l.amountCents === amountCents)).toBe(true);

      const summary = await request(app)
        .get(`/finance/bank-statement/summary?institutionId=${fx.a.institutionId}`)
        .set(auth(fx.a.schoolAdmin.token));
      expect(summary.status).toBe(200);
      expect(summary.body.counts.matched).toBeGreaterThanOrEqual(1);
    });
  });
});
