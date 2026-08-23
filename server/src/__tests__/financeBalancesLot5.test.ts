import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';
import { computeStudentBalances } from '../lib/financeBalances.js';
import { createDraftSchedule, validateSchedule, publishSchedule, issueInvoiceFromSchedule } from '../lib/feeSchedules.js';

describe('Finance balances Lot 5', () => {
  let fx: Fixture;
  let scheduleId: string;

  beforeAll(async () => {
    fx = await buildFixture();
    await request(app)
      .put(`/institutions/${fx.a.institutionId}/features/finance`)
      .set(auth(fx.globalAdmin.token))
      .send({ enabled: true });

    const draft = await createDraftSchedule({
      institutionId: fx.a.institutionId,
      academicYear: '2026-2027',
      name: 'Lot5 balances',
      createdBy: fx.a.schoolAdmin.id,
      items: [
        {
          feeTypeCode: 'ANNUAL_TUITION',
          cycleCode: 'COLLEGE',
          feeOrigin: 'institution',
          amountCents: 10000,
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
    scheduleId = published.id;

    await issueInvoiceFromSchedule({
      scheduleId,
      institutionId: fx.a.institutionId,
      studentId: fx.a.student.id,
      createdBy: fx.a.schoolAdmin.id,
      cycleCode: 'COLLEGE',
    });
  }, 60000);

  afterAll(async () => {
    await prisma.strkInvoice.deleteMany({ where: { feeScheduleId: scheduleId } }).catch(() => {});
    await prisma.strkFeeScheduleItem.deleteMany({ where: { feeScheduleId: scheduleId } }).catch(() => {});
    await prisma.strkFeeSchedule.deleteMany({ where: { id: scheduleId } }).catch(() => {});
  });

  it('calcule un solde à la date pour l’élève facturé', async () => {
    const rows = await computeStudentBalances({
      institutionId: fx.a.institutionId,
      asOf: new Date('2099-12-31'),
    });
    const row = rows.find((r) => r.studentId === fx.a.student.id);
    expect(row).toBeTruthy();
    expect(row!.scheduleInvoiceCount).toBeGreaterThanOrEqual(1);
    expect(row!.balanceCents).toBeGreaterThanOrEqual(10000);
  });

  it('GET /finance/balances + export CSV (RBAC + audit)', async () => {
    const asOf = '2099-12-31';
    const teacher = await request(app)
      .get(`/finance/balances?asOf=${asOf}`)
      .set(auth(fx.a.teacher.token));
    expect(teacher.status).toBe(403);

    const res = await request(app)
      .get(`/finance/balances?asOf=${asOf}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(res.status).toBe(200);
    expect(res.body.scheduleInvoiceCount).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.rows)).toBe(true);

    const leak = await request(app)
      .get(`/finance/balances?asOf=${asOf}`)
      .set(auth(fx.b.schoolAdmin.token));
    expect(leak.status).toBe(200);
    expect(leak.body.rows.every((r: { studentId: string }) => r.studentId !== fx.a.student.id)).toBe(
      true
    );

    const csv = await request(app)
      .get(`/finance/balances/export?asOf=${asOf}&format=csv`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/csv/);
    expect(csv.text).toContain('Élève');

    const audit = await prisma.strkAuditLog.findFirst({
      where: {
        institutionId: fx.a.institutionId,
        action: 'finance.balances.exported',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).toBeTruthy();
  });

  it('parent voit feeOrigin sur les lignes de facture', async () => {
    const res = await request(app)
      .get(`/finance/invoices?studentId=${fx.a.student.id}`)
      .set(auth(fx.parentA.token));
    expect(res.status).toBe(200);
    const fromSchedule = res.body.invoices.find(
      (i: { feeScheduleId?: string }) => i.feeScheduleId === scheduleId
    );
    expect(fromSchedule).toBeTruthy();
    expect(fromSchedule.lines.some((l: { feeOrigin?: string }) => l.feeOrigin === 'institution')).toBe(
      true
    );
  });
});
