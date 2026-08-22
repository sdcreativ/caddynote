import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * FIN-007 — rapprochement bancaire. Montants randomisés par test pour
 * éviter qu'un paiement créé dans un scénario ne devienne un candidat
 * ambigu pour le rapprochement automatique d'un autre.
 */
describe('Rapprochement bancaire (FIN-007)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  const randomAmount = () => 500000 + Math.floor(Math.random() * 400000);

  const createPaidPayment = async (amountCents: number) => {
    const feeRes = await request(app).post('/finance/fee-items').set(auth(fx.a.schoolAdmin.token)).send({
      institutionId: fx.a.institutionId,
      name: `Frais ${amountCents}`,
      amountCents,
    });
    const invoiceRes = await request(app).post('/finance/invoices').set(auth(fx.a.schoolAdmin.token)).send({
      institutionId: fx.a.institutionId,
      studentId: fx.a.student.id,
      lines: [{ feeItemId: feeRes.body.feeItem.id, quantity: 1 }],
    });
    const payRes = await request(app)
      .post(`/finance/invoices/${invoiceRes.body.invoice.id}/payments/manual`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ amountCents, method: 'cash' });
    expect(payRes.status).toBe(201);
    return payRes.body.payment.id as string;
  };

  const today = () => new Date().toISOString().split('T')[0];

  it('rapproche automatiquement une ligne quand un unique paiement candidat existe', async () => {
    const amount = randomAmount();
    const paymentId = await createPaidPayment(amount);

    const res = await request(app).post('/finance/bank-statement/import').set(auth(fx.a.schoolAdmin.token)).send({
      institutionId: fx.a.institutionId,
      lines: [{ date: today(), amountCents: amount, label: 'Virement reçu' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.autoMatched).toBe(1);

    const list = await request(app)
      .get(`/finance/bank-statement/lines?institutionId=${fx.a.institutionId}&status=matched`)
      .set(auth(fx.a.schoolAdmin.token));
    const line = list.body.lines.find((l: any) => l.id === res.body.lineIds[0]);
    expect(line.matchedPaymentId).toBe(paymentId);
  });

  it('ne rapproche jamais automatiquement en cas d’ambiguïté (deux candidats identiques)', async () => {
    const amount = randomAmount();
    await createPaidPayment(amount);
    await createPaidPayment(amount);

    const res = await request(app).post('/finance/bank-statement/import').set(auth(fx.a.schoolAdmin.token)).send({
      institutionId: fx.a.institutionId,
      lines: [{ date: today(), amountCents: amount, label: 'Virement ambigu' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.autoMatched).toBe(0);

    const list = await request(app)
      .get(`/finance/bank-statement/lines?institutionId=${fx.a.institutionId}&status=unmatched`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(list.body.lines.some((l: any) => l.id === res.body.lineIds[0])).toBe(true);
  });

  it('reste "unmatched" sans aucun candidat, et permet un rapprochement manuel', async () => {
    const amount = randomAmount();
    const res = await request(app).post('/finance/bank-statement/import').set(auth(fx.a.schoolAdmin.token)).send({
      institutionId: fx.a.institutionId,
      lines: [{ date: today(), amountCents: amount, label: 'Sans candidat' }],
    });
    expect(res.body.autoMatched).toBe(0);
    const lineId = res.body.lineIds[0];

    // Refuse un paiement d'un autre établissement.
    const otherInstitutionPaymentId = await (async () => {
      const feeRes = await request(app).post('/finance/fee-items').set(auth(fx.b.schoolAdmin.token)).send({
        institutionId: fx.b.institutionId,
        name: 'Frais B',
        amountCents: amount,
      });
      const invoiceRes = await request(app).post('/finance/invoices').set(auth(fx.b.schoolAdmin.token)).send({
        institutionId: fx.b.institutionId,
        studentId: fx.b.student.id,
        lines: [{ feeItemId: feeRes.body.feeItem.id, quantity: 1 }],
      });
      const payRes = await request(app)
        .post(`/finance/invoices/${invoiceRes.body.invoice.id}/payments/manual`)
        .set(auth(fx.b.schoolAdmin.token))
        .send({ amountCents: amount, method: 'cash' });
      return payRes.body.payment.id as string;
    })();
    const crossMatch = await request(app)
      .post(`/finance/bank-statement/lines/${lineId}/match`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ paymentId: otherInstitutionPaymentId });
    expect(crossMatch.status).toBe(400);

    const paymentId = await createPaidPayment(amount);
    const manual = await request(app)
      .post(`/finance/bank-statement/lines/${lineId}/match`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ paymentId });
    expect(manual.status).toBe(200);
    expect(manual.body.line.status).toBe('matched');

    // Annulation du rapprochement.
    const undo = await request(app).delete(`/finance/bank-statement/lines/${lineId}/match`).set(auth(fx.a.schoolAdmin.token));
    expect(undo.status).toBe(200);
    expect(undo.body.line.status).toBe('unmatched');
    expect(undo.body.line.matchedPaymentId).toBeNull();
  });

  it('retente le rapprochement automatique après coup (paiement enregistré après l’import)', async () => {
    const amount = randomAmount();
    const res = await request(app).post('/finance/bank-statement/import').set(auth(fx.a.schoolAdmin.token)).send({
      institutionId: fx.a.institutionId,
      lines: [{ date: today(), amountCents: amount, label: 'À rapprocher plus tard' }],
    });
    const lineId = res.body.lineIds[0];

    const retryTooEarly = await request(app).post(`/finance/bank-statement/lines/${lineId}/auto-match`).set(auth(fx.a.schoolAdmin.token));
    expect(retryTooEarly.body.matched).toBe(false);

    await createPaidPayment(amount);
    const retry = await request(app).post(`/finance/bank-statement/lines/${lineId}/auto-match`).set(auth(fx.a.schoolAdmin.token));
    expect(retry.body.matched).toBe(true);
    expect(retry.body.line.status).toBe('matched');
  });

  it('marque une ligne comme ignorée (ex. frais bancaires, hors sujet)', async () => {
    const amount = randomAmount();
    const res = await request(app).post('/finance/bank-statement/import').set(auth(fx.a.schoolAdmin.token)).send({
      institutionId: fx.a.institutionId,
      lines: [{ date: today(), amountCents: amount, label: 'Frais de tenue de compte' }],
    });
    const lineId = res.body.lineIds[0];
    const ignoreRes = await request(app).post(`/finance/bank-statement/lines/${lineId}/ignore`).set(auth(fx.a.schoolAdmin.token));
    expect(ignoreRes.status).toBe(200);
    expect(ignoreRes.body.line.status).toBe('ignored');
  });

  it('le bilan liste les lignes non rapprochées et les paiements sans ligne correspondante', async () => {
    const amount = randomAmount();
    const paymentId = await createPaidPayment(amount); // jamais importé côté relevé -> "non rapproché"
    const unmatchedAmount = randomAmount();
    await request(app).post('/finance/bank-statement/import').set(auth(fx.a.schoolAdmin.token)).send({
      institutionId: fx.a.institutionId,
      lines: [{ date: today(), amountCents: unmatchedAmount, label: 'Non rapprochée' }],
    });

    const summary = await request(app)
      .get(`/finance/bank-statement/summary?institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(summary.status).toBe(200);
    expect(summary.body.counts.unmatched).toBeGreaterThanOrEqual(1);
    expect(summary.body.unreconciledPayments.some((p: any) => p.id === paymentId)).toBe(true);
  });

  it('isolation multi-tenant sur tous les endpoints, et rôle enseignant refusé', async () => {
    const importCross = await request(app).post('/finance/bank-statement/import').set(auth(fx.b.schoolAdmin.token)).send({
      institutionId: fx.a.institutionId,
      lines: [{ date: today(), amountCents: 1000, label: 'Intrusion' }],
    });
    expect(importCross.status).toBe(403);

    const listCross = await request(app)
      .get(`/finance/bank-statement/lines?institutionId=${fx.a.institutionId}`)
      .set(auth(fx.b.schoolAdmin.token));
    expect(listCross.status).toBe(403);

    const summaryCross = await request(app)
      .get(`/finance/bank-statement/summary?institutionId=${fx.a.institutionId}`)
      .set(auth(fx.b.schoolAdmin.token));
    expect(summaryCross.status).toBe(403);

    const teacherImport = await request(app).post('/finance/bank-statement/import').set(auth(fx.a.teacher.token)).send({
      institutionId: fx.a.institutionId,
      lines: [{ date: today(), amountCents: 1000, label: 'Refusé' }],
    });
    expect(teacherImport.status).toBe(403);
  });
});
