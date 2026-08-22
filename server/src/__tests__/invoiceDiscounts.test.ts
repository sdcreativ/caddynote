import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * FIN-002 — remises/bourses sur facture. `StrkInvoiceLine.amountCents`
 * était contraint positif sans aucune façon de représenter une réduction ;
 * `lineType: 'discount'` permet désormais une ligne de remise (toujours une
 * magnitude positive saisie par le personnel, jamais un montant négatif en
 * base) qui se retranche du total plutôt que de s'y ajouter.
 *
 * Hors périmètre ici (nécessitent une politique métier que ce correctif ne
 * présume pas) : échéanciers de paiement et pénalités de retard.
 */
describe('Remises et bourses sur facture (FIN-002)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it('une ligne de remise se retranche du total de la facture', async () => {
    const fee = await request(app).post('/finance/fee-items').set(auth(fx.a.schoolAdmin.token)).send({
      name: 'Frais de scolarité',
      amountCents: 100000,
    });
    expect(fee.status).toBe(201);

    const invoice = await request(app).post('/finance/invoices').set(auth(fx.a.schoolAdmin.token)).send({
      studentId: fx.a.student.id,
      lines: [
        { feeItemId: fee.body.feeItem.id, quantity: 1 },
        { lineType: 'discount', label: 'Bourse municipale', amountCents: 30000 },
      ],
    });
    expect(invoice.status).toBe(201);
    expect(invoice.body.invoice.totalCents).toBe(70000);
    expect(invoice.body.invoice.lines).toHaveLength(2);
    const discountLine = invoice.body.invoice.lines.find((l: any) => l.lineType === 'discount');
    expect(discountLine.amountCents).toBe(30000); // magnitude positive en base, jamais négative
  });

  it('plusieurs remises (fratrie + bourse) se cumulent correctement', async () => {
    const fee = await request(app).post('/finance/fee-items').set(auth(fx.a.schoolAdmin.token)).send({
      name: 'Frais annuels',
      amountCents: 200000,
    });
    const invoice = await request(app).post('/finance/invoices').set(auth(fx.a.schoolAdmin.token)).send({
      studentId: fx.a.student.id,
      lines: [
        { feeItemId: fee.body.feeItem.id, quantity: 1 },
        { lineType: 'discount', label: 'Remise fratrie', amountCents: 20000 },
        { lineType: 'discount', label: 'Bourse au mérite', amountCents: 50000 },
      ],
    });
    expect(invoice.status).toBe(201);
    expect(invoice.body.invoice.totalCents).toBe(130000);
  });

  it('refuse une remise qui dépasserait le total des frais', async () => {
    const fee = await request(app).post('/finance/fee-items').set(auth(fx.a.schoolAdmin.token)).send({
      name: 'Petits frais',
      amountCents: 10000,
    });
    const invoice = await request(app).post('/finance/invoices').set(auth(fx.a.schoolAdmin.token)).send({
      studentId: fx.a.student.id,
      lines: [
        { feeItemId: fee.body.feeItem.id, quantity: 1 },
        { lineType: 'discount', label: 'Bourse totale', amountCents: 50000 },
      ],
    });
    expect(invoice.status).toBe(400);
  });

  it('une remise sans label ni montant est rejetée', async () => {
    const fee = await request(app).post('/finance/fee-items').set(auth(fx.a.schoolAdmin.token)).send({
      name: 'Frais',
      amountCents: 10000,
    });
    const invoice = await request(app).post('/finance/invoices').set(auth(fx.a.schoolAdmin.token)).send({
      studentId: fx.a.student.id,
      lines: [{ feeItemId: fee.body.feeItem.id, quantity: 1 }, { lineType: 'discount' }],
    });
    expect(invoice.status).toBe(400);
  });
});
