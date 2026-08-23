import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';
import { hashPassword } from '../lib/password.js';
import {
  constituteFeeLines,
  computeNetPayable,
} from '../lib/feeScheduleEngine.js';
import {
  getNationalFeeAmount,
  resolveOfficialRegistrationLine,
} from '../lib/nationalFees.js';
import {
  createDraftSchedule,
  validateSchedule,
  publishSchedule,
  createRevisedDraft,
  issueInvoiceFromSchedule,
} from '../lib/feeSchedules.js';
import { computeStudentBalances } from '../lib/financeBalances.js';

/**
 * Lot 6 — matrice CA document + gaps techniques (legacy, refund, national inject).
 * Déploiement staging / prod : hors scope (autorisation explicite requise).
 */
describe('Fee grid Lot 6 — critères d’acceptation (CA)', () => {
  let fx: Fixture;
  let secondStudentId: string;

  beforeAll(async () => {
    fx = await buildFixture();
    await request(app)
      .put(`/institutions/${fx.a.institutionId}/features/finance`)
      .set(auth(fx.globalAdmin.token))
      .send({ enabled: true });

    const passwordHash = await hashPassword('Lot6Student!');
    const profile = await prisma.strkProfile.create({
      data: {
        email: `lot6.student2.${Date.now()}@isolation.test`,
        firstName: 'Frere',
        lastName: 'Lot6',
        role: 'student',
        institutionId: fx.a.institutionId,
        passwordHash,
      },
    });
    const student = await prisma.strkStudent.create({
      data: { id: profile.id, institutionId: fx.a.institutionId },
    });
    secondStudentId = student.id;
  }, 60000);

  afterAll(async () => {
    await prisma.strkRefund.deleteMany({
      where: { payment: { invoice: { institutionId: fx.a.institutionId } } },
    }).catch(() => {});
    await prisma.strkPayment.deleteMany({
      where: { invoice: { institutionId: fx.a.institutionId } },
    }).catch(() => {});
    await prisma.strkInvoice.deleteMany({ where: { institutionId: fx.a.institutionId } }).catch(() => {});
    await prisma.strkFeeScheduleItem
      .deleteMany({ where: { feeSchedule: { institutionId: fx.a.institutionId } } })
      .catch(() => {});
    await prisma.strkFeeSchedule.deleteMany({ where: { institutionId: fx.a.institutionId } }).catch(() => {});
    await prisma.strkStudent.delete({ where: { id: secondStudentId } }).catch(() => {});
    await prisma.strkProfile.delete({ where: { id: secondStudentId } }).catch(() => {});
  });

  it('CA-01 — création grille brouillon sans facture automatique', async () => {
    const before = await prisma.strkInvoice.count({ where: { institutionId: fx.a.institutionId } });
    const draft = await createDraftSchedule({
      institutionId: fx.a.institutionId,
      academicYear: '2026-2027',
      name: `CA01 ${Date.now()}`,
      createdBy: fx.a.schoolAdmin.id,
      items: [
        {
          feeTypeCode: 'ANNUAL_TUITION',
          cycleCode: 'COLLEGE',
          feeOrigin: 'institution',
          amountCents: 150000,
        },
      ],
    });
    expect(draft.status).toBe('draft');
    const after = await prisma.strkInvoice.count({ where: { institutionId: fx.a.institutionId } });
    expect(after).toBe(before);
  });

  it('CA-02 — publication → items immuables', async () => {
    const draft = await createDraftSchedule({
      institutionId: fx.a.institutionId,
      academicYear: '2026-2027',
      name: `CA02 ${Date.now()}`,
      createdBy: fx.a.schoolAdmin.id,
      items: [
        {
          feeTypeCode: 'ANNUAL_TUITION',
          cycleCode: 'COLLEGE',
          feeOrigin: 'institution',
          amountCents: 100000,
        },
      ],
    });
    await validateSchedule({
      scheduleId: draft.id,
      institutionId: fx.a.institutionId,
      actorId: fx.a.schoolAdmin.id,
    });
    const published = await publishSchedule({
      scheduleId: draft.id,
      institutionId: fx.a.institutionId,
      actorId: fx.a.schoolAdmin.id,
    });
    expect(published.status).toBe('published');

    const locked = await request(app)
      .put(`/finance/fee-schedules/${draft.id}/items`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({
        items: [{ feeTypeCode: 'ANNUAL_TUITION', amountCents: 1, feeOrigin: 'institution' }],
      });
    expect(locked.status).toBe(409);
    expect(locked.body.code).toBe('SCHEDULE_NOT_DRAFT');
  });

  it('CA-03 / CA-04 / CA-05 — référentiel national CI (6000 / 3000 / 0)', async () => {
    const collegePublic = await getNationalFeeAmount({
      countryCode: 'CI',
      academicYear: '2026-2027',
      cycleCode: 'COLLEGE',
      fundingSector: 'public',
    });
    expect(collegePublic?.amountCents).toBe(6000);

    const collegePrivate = await getNationalFeeAmount({
      countryCode: 'CI',
      academicYear: '2026-2027',
      cycleCode: 'COLLEGE',
      fundingSector: 'private',
    });
    expect(collegePrivate?.amountCents).toBe(3000);

    const primaryPublic = await resolveOfficialRegistrationLine({
      countryCode: 'CI',
      academicYear: '2026-2027',
      cycleCode: 'PRIMARY',
      fundingSector: 'public',
    });
    expect(primaryPublic).toBeNull();
  });

  it('CA-03 — injection nationale collège public 6000 sur facture', async () => {
    const draft = await createDraftSchedule({
      institutionId: fx.a.institutionId,
      academicYear: '2026-2027',
      name: `CA03 inject ${Date.now()}`,
      createdBy: fx.a.schoolAdmin.id,
      items: [
        {
          feeTypeCode: 'ANNUAL_TUITION',
          cycleCode: 'COLLEGE',
          feeOrigin: 'institution',
          amountCents: 50000,
        },
      ],
    });
    await validateSchedule({
      scheduleId: draft.id,
      institutionId: fx.a.institutionId,
      actorId: fx.a.schoolAdmin.id,
    });
    await publishSchedule({
      scheduleId: draft.id,
      institutionId: fx.a.institutionId,
      actorId: fx.a.schoolAdmin.id,
    });

    const invoice = await issueInvoiceFromSchedule({
      scheduleId: draft.id,
      institutionId: fx.a.institutionId,
      studentId: fx.a.student.id,
      createdBy: fx.a.schoolAdmin.id,
      cycleCode: 'COLLEGE',
      includeNationalRegistration: true,
      fundingSector: 'public',
      countryCode: 'CI',
    });

    const stateLine = invoice.lines.find((l) => l.feeOrigin === 'state');
    expect(stateLine?.amountCents).toBe(6000);
    expect(invoice.totalCents).toBe(56000);
  });

  it('CA-04 — collège privé : officiel 3000 + frais école séparés', async () => {
    const draft = await createDraftSchedule({
      institutionId: fx.a.institutionId,
      academicYear: '2026-2027',
      name: `CA04 ${Date.now()}`,
      createdBy: fx.a.schoolAdmin.id,
      items: [
        {
          feeTypeCode: 'STATE_REGISTRATION',
          cycleCode: 'COLLEGE',
          feeOrigin: 'state',
          amountCents: 3000,
        },
        {
          feeTypeCode: 'ANNUAL_TUITION',
          cycleCode: 'COLLEGE',
          feeOrigin: 'institution',
          amountCents: 200000,
        },
      ],
    });
    await validateSchedule({
      scheduleId: draft.id,
      institutionId: fx.a.institutionId,
      actorId: fx.a.schoolAdmin.id,
    });
    await publishSchedule({
      scheduleId: draft.id,
      institutionId: fx.a.institutionId,
      actorId: fx.a.schoolAdmin.id,
    });

    const invoice = await issueInvoiceFromSchedule({
      scheduleId: draft.id,
      institutionId: fx.a.institutionId,
      studentId: fx.a.student.id,
      createdBy: fx.a.schoolAdmin.id,
      cycleCode: 'COLLEGE',
    });

    expect(invoice.lines.some((l) => l.feeOrigin === 'state' && l.amountCents === 3000)).toBe(true);
    expect(invoice.lines.some((l) => l.feeOrigin === 'institution' && l.amountCents === 200000)).toBe(
      true
    );
    expect(invoice.totalCents).toBe(203000);
  });

  it('CA-06 — cantine seulement après souscription', () => {
    const items = [
      {
        feeTypeCode: 'ANNUAL_TUITION',
        feeOrigin: 'institution' as const,
        amountCents: 100000,
        currency: 'XOF',
        isMandatory: true,
        cycleCode: 'COLLEGE',
      },
      {
        feeTypeCode: 'CANTEEN',
        feeOrigin: 'institution' as const,
        amountCents: 25000,
        currency: 'XOF',
        isMandatory: false,
        cycleCode: 'COLLEGE',
      },
    ];
    const without = constituteFeeLines({ scheduleItems: items, cycleCode: 'COLLEGE' });
    expect(without.some((l) => l.feeTypeCode === 'CANTEEN')).toBe(false);
    const withOpt = constituteFeeLines({
      scheduleItems: items,
      cycleCode: 'COLLEGE',
      optionalFeeTypeCodes: ['CANTEEN'],
    });
    expect(withOpt.some((l) => l.feeTypeCode === 'CANTEEN')).toBe(true);
  });

  it('CA-07 — réduction famille nombreuse ciblée (lignes éligibles)', () => {
    const feeLines = constituteFeeLines({
      scheduleItems: [
        {
          feeTypeCode: 'STATE_REGISTRATION',
          feeOrigin: 'state',
          amountCents: 3000,
          currency: 'XOF',
          isMandatory: true,
          isDiscountable: false,
        },
        {
          feeTypeCode: 'ANNUAL_TUITION',
          feeOrigin: 'institution',
          amountCents: 240000,
          currency: 'XOF',
          isMandatory: true,
          isDiscountable: true,
        },
      ],
    });
    const result = computeNetPayable({
      feeLines,
      adjustments: [
        {
          code: 'FAMILY_DISCOUNT',
          kind: 'discount',
          label: 'Famille nombreuse',
          percent: 10,
          appliesToFeeTypeCodes: ['ANNUAL_TUITION'],
        },
      ],
    });
    expect(result.stateCents).toBe(3000);
    expect(result.discountCents).toBe(24000);
    expect(result.netCents).toBe(219000);
  });

  it('CA-08 — multi-enfants : soldes ventilés par élève (sans allocation multi-factures)', async () => {
    const draft = await createDraftSchedule({
      institutionId: fx.a.institutionId,
      academicYear: '2026-2027',
      name: `CA08 ${Date.now()}`,
      createdBy: fx.a.schoolAdmin.id,
      items: [
        {
          feeTypeCode: 'ANNUAL_TUITION',
          cycleCode: 'COLLEGE',
          feeOrigin: 'institution',
          amountCents: 8000,
        },
      ],
    });
    await validateSchedule({
      scheduleId: draft.id,
      institutionId: fx.a.institutionId,
      actorId: fx.a.schoolAdmin.id,
    });
    await publishSchedule({
      scheduleId: draft.id,
      institutionId: fx.a.institutionId,
      actorId: fx.a.schoolAdmin.id,
    });

    await issueInvoiceFromSchedule({
      scheduleId: draft.id,
      institutionId: fx.a.institutionId,
      studentId: fx.a.student.id,
      createdBy: fx.a.schoolAdmin.id,
      cycleCode: 'COLLEGE',
    });
    await issueInvoiceFromSchedule({
      scheduleId: draft.id,
      institutionId: fx.a.institutionId,
      studentId: secondStudentId,
      createdBy: fx.a.schoolAdmin.id,
      cycleCode: 'COLLEGE',
    });

    const rows = await computeStudentBalances({
      institutionId: fx.a.institutionId,
      asOf: new Date('2099-12-31'),
    });
    const a = rows.find((r) => r.studentId === fx.a.student.id);
    const b = rows.find((r) => r.studentId === secondStudentId);
    expect(a?.balanceCents).toBeGreaterThanOrEqual(8000);
    expect(b?.balanceCents).toBeGreaterThanOrEqual(8000);
    expect(a?.studentId).not.toBe(b?.studentId);
  });

  it('CA-09 — remboursement : opération compensatrice, paiement d’origine conservé', async () => {
    const fee = await request(app)
      .post('/finance/fee-items')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ name: 'CA09 fee', amountCents: 5000, currency: 'XOF' });
    expect(fee.status).toBe(201);

    const invoice = await request(app)
      .post('/finance/invoices')
      .set(auth(fx.a.schoolAdmin.token))
      .send({
        studentId: fx.a.student.id,
        lines: [{ feeItemId: fee.body.feeItem.id, quantity: 1 }],
      });
    expect(invoice.status).toBe(201);
    const invoiceId = invoice.body.invoice.id as string;
    const originalTotal = invoice.body.invoice.totalCents as number;

    const pay = await request(app)
      .post(`/finance/invoices/${invoiceId}/payments/manual`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ amountCents: originalTotal, method: 'cash' });
    expect(pay.status).toBe(201);
    const paymentId = pay.body.payment.id as string;
    const originalAmount = pay.body.payment.amountCents as number;

    const refund = await request(app)
      .post(`/finance/payments/${paymentId}/refund`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ amountCents: originalAmount, reason: 'CA-09 annulation reçu' });
    expect(refund.status).toBe(201);
    expect(refund.body.refund.paymentId).toBe(paymentId);
    expect(refund.body.refund.amountCents).toBe(originalAmount);

    const payment = await prisma.strkPayment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.amountCents).toBe(originalAmount);
    expect(payment.status).toBe('refunded');
  });

  it('CA-10 — changement tarif → nouvelle version, anciennes factures intactes', async () => {
    const draft = await createDraftSchedule({
      institutionId: fx.a.institutionId,
      academicYear: '2026-2027',
      name: `CA10 ${Date.now()}`,
      createdBy: fx.a.schoolAdmin.id,
      items: [
        {
          feeTypeCode: 'ANNUAL_TUITION',
          cycleCode: 'COLLEGE',
          feeOrigin: 'institution',
          amountCents: 12000,
        },
      ],
    });
    await validateSchedule({
      scheduleId: draft.id,
      institutionId: fx.a.institutionId,
      actorId: fx.a.schoolAdmin.id,
    });
    const published = await publishSchedule({
      scheduleId: draft.id,
      institutionId: fx.a.institutionId,
      actorId: fx.a.schoolAdmin.id,
    });

    const invoice = await issueInvoiceFromSchedule({
      scheduleId: published.id,
      institutionId: fx.a.institutionId,
      studentId: fx.a.student.id,
      createdBy: fx.a.schoolAdmin.id,
      cycleCode: 'COLLEGE',
    });
    const snap = JSON.stringify(invoice.tariffSnapshot);
    const total = invoice.totalCents;

    const revised = await createRevisedDraft({
      scheduleId: published.id,
      institutionId: fx.a.institutionId,
      createdBy: fx.a.schoolAdmin.id,
    });
    expect(revised.version).toBe(published.version + 1);

    const still = await prisma.strkInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(still.totalCents).toBe(total);
    expect(JSON.stringify(still.tariffSnapshot)).toBe(snap);
  });

  it('compatibilité facture legacy sans feeScheduleId (soldes)', async () => {
    const fee = await request(app)
      .post('/finance/fee-items')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ name: 'Legacy fee', amountCents: 2500, currency: 'XOF' });
    expect(fee.status).toBe(201);

    const invoice = await request(app)
      .post('/finance/invoices')
      .set(auth(fx.a.schoolAdmin.token))
      .send({
        studentId: secondStudentId,
        lines: [{ feeItemId: fee.body.feeItem.id, quantity: 1 }],
      });
    expect(invoice.status).toBe(201);
    expect(invoice.body.invoice.feeScheduleId ?? null).toBeNull();

    const rows = await computeStudentBalances({
      institutionId: fx.a.institutionId,
      asOf: new Date('2099-12-31'),
    });
    const row = rows.find((r) => r.studentId === secondStudentId);
    expect(row).toBeTruthy();
    expect(row!.balanceCents).toBeGreaterThanOrEqual(2500);
  });
});
