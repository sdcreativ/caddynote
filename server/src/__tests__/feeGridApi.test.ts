import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, auth, issueTestToken, type Fixture } from './fixtures.js';
import { hashPassword } from '../lib/password.js';

/**
 * Lot 3 — API grille financière : RBAC, isolation tenant, publish immuable,
 * idempotence publish / generate-invoice.
 */
describe('Fee grid API (Lot 3)', () => {
  let fx: Fixture;
  let accountantToken: string;
  let accountantId: string;

  beforeAll(async () => {
    fx = await buildFixture();
    await request(app)
      .put(`/institutions/${fx.a.institutionId}/features/finance`)
      .set(auth(fx.globalAdmin.token))
      .send({ enabled: true });

    const passwordHash = await hashPassword('Accountant1!');
    const accountant = await prisma.strkProfile.create({
      data: {
        email: `accountant.lot3.${Date.now()}@isolation.test`,
        firstName: 'Compta',
        lastName: 'Lot3',
        role: 'accountant',
        institutionId: fx.a.institutionId,
        passwordHash,
      },
    });
    accountantId = accountant.id;
    accountantToken = await issueTestToken({
      sub: accountant.id,
      role: 'accountant',
      institutionId: fx.a.institutionId,
    });
  }, 60000);

  afterAll(async () => {
    await prisma.strkInvoice
      .deleteMany({ where: { institutionId: fx.a.institutionId, feeScheduleId: { not: null } } })
      .catch(() => {});
    await prisma.strkFeeScheduleItem
      .deleteMany({ where: { feeSchedule: { institutionId: fx.a.institutionId } } })
      .catch(() => {});
    await prisma.strkFeeSchedule.deleteMany({ where: { institutionId: fx.a.institutionId } }).catch(() => {});
    await prisma.strkFeeType
      .deleteMany({ where: { institutionId: fx.a.institutionId } })
      .catch(() => {});
    await prisma.strkFeePlanTemplate
      .deleteMany({ where: { institutionId: fx.a.institutionId } })
      .catch(() => {});
    await prisma.strkProfile.delete({ where: { id: accountantId } }).catch(() => {});
  });

  it('enseignant ne peut pas lister les types de frais', async () => {
    const res = await request(app)
      .get('/finance/fee-types')
      .set(auth(fx.a.teacher.token));
    expect(res.status).toBe(403);
  });

  it('comptable lit le catalogue plateforme + crée un type custom', async () => {
    const list = await request(app).get('/finance/fee-types').set(auth(accountantToken));
    expect(list.status).toBe(200);
    expect(list.body.feeTypes.some((t: { code: string }) => t.code === 'STATE_REGISTRATION')).toBe(
      true
    );

    const created = await request(app)
      .post('/finance/fee-types')
      .set(auth(accountantToken))
      .send({
        code: 'CUSTOM_LOT3_FEE',
        label: 'Frais custom Lot3',
        category: 'misc',
      });
    expect(created.status).toBe(201);
    expect(created.body.feeType.institutionId).toBe(fx.a.institutionId);

    const platform = list.body.feeTypes.find((t: { code: string; institutionId: string | null }) =>
      t.code === 'STATE_REGISTRATION' && t.institutionId == null
    );
    const deny = await request(app)
      .patch(`/finance/fee-types/${platform.id}`)
      .set(auth(accountantToken))
      .send({ label: 'Hack' });
    expect(deny.status).toBe(403);
    expect(deny.body.code).toBe('FEE_TYPE_PLATFORM_READONLY');
  });

  it('lit le référentiel national CI et isole le tenant B', async () => {
    const national = await request(app)
      .get('/finance/national-fees?countryCode=CI&academicYear=2026-2027')
      .set(auth(accountantToken));
    expect(national.status).toBe(200);
    expect(national.body.version.managedBy).toBe('state_ci');
    expect(national.body.version.rates.length).toBe(8);

    const created = await request(app)
      .post('/finance/fee-schedules')
      .set(auth(accountantToken))
      .send({
        academicYear: '2026-2027',
        name: 'Grille A privée',
        items: [
          {
            feeTypeCode: 'ANNUAL_TUITION',
            cycleCode: 'COLLEGE',
            feeOrigin: 'institution',
            amountCents: 100000,
          },
        ],
      });
    expect(created.status).toBe(201);

    const leak = await request(app)
      .get(`/finance/fee-schedules/${created.body.schedule.id}`)
      .set(auth(fx.b.schoolAdmin.token));
    expect(leak.status).toBe(404);
  });

  it('workflow draft → validate (comptable) → publish (direction) + immuabilité', async () => {
    const draft = await request(app)
      .post('/finance/fee-schedules')
      .set(auth(accountantToken))
      .send({
        academicYear: '2026-2027',
        name: `Publish flow ${Date.now()}`,
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
    expect(draft.status).toBe(201);
    const id = draft.body.schedule.id as string;

    const asTeacherPublish = await request(app)
      .post(`/finance/fee-schedules/${id}/publish`)
      .set(auth(fx.a.teacher.token));
    expect(asTeacherPublish.status).toBe(403);

    // Comptable ne publie pas (permission distincte direction).
    const accountantPublish = await request(app)
      .post(`/finance/fee-schedules/${id}/publish`)
      .set(auth(accountantToken));
    expect(accountantPublish.status).toBe(403);

    const validated = await request(app)
      .post(`/finance/fee-schedules/${id}/validate`)
      .set(auth(accountantToken));
    expect(validated.status).toBe(200);
    expect(validated.body.schedule.status).toBe('validated');

    const itemsLocked = await request(app)
      .put(`/finance/fee-schedules/${id}/items`)
      .set(auth(accountantToken))
      .send({ items: [{ feeTypeCode: 'X', amountCents: 1 }] });
    expect(itemsLocked.status).toBe(409);
    expect(itemsLocked.body.code).toBe('SCHEDULE_NOT_DRAFT');

    const idemKey = `publish-${id}`;
    const published = await request(app)
      .post(`/finance/fee-schedules/${id}/publish`)
      .set(auth(fx.a.schoolAdmin.token))
      .set('Idempotency-Key', idemKey);
    expect(published.status).toBe(200);
    expect(published.body.schedule.status).toBe('published');

    const replay = await request(app)
      .post(`/finance/fee-schedules/${id}/publish`)
      .set(auth(fx.a.schoolAdmin.token))
      .set('Idempotency-Key', idemKey);
    expect(replay.status).toBe(200);
    expect(replay.body.idempotentReplay).toBe(true);
    expect(replay.body.schedule.id).toBe(id);

    const invoice = await request(app)
      .post(`/finance/fee-schedules/${id}/generate-invoice`)
      .set(auth(accountantToken))
      .set('Idempotency-Key', `inv-${id}`)
      .send({ studentId: fx.a.student.id, cycleCode: 'COLLEGE' });
    expect(invoice.status).toBe(201);
    expect(invoice.body.invoice.totalCents).toBe(203000);
    expect(invoice.body.invoice.tariffSnapshot).toBeTruthy();

    const invoiceReplay = await request(app)
      .post(`/finance/fee-schedules/${id}/generate-invoice`)
      .set(auth(accountantToken))
      .set('Idempotency-Key', `inv-${id}`)
      .send({ studentId: fx.a.student.id, cycleCode: 'COLLEGE' });
    expect(invoiceReplay.status).toBe(200);
    expect(invoiceReplay.body.idempotentReplay).toBe(true);
    expect(invoiceReplay.body.invoice.id).toBe(invoice.body.invoice.id);
  });

  it('refuse la génération depuis une grille d’un autre tenant', async () => {
    const schedule = await prisma.strkFeeSchedule.findFirst({
      where: { institutionId: fx.a.institutionId, status: 'published' },
    });
    expect(schedule).not.toBeNull();

    const res = await request(app)
      .post(`/finance/fee-schedules/${schedule!.id}/generate-invoice`)
      .set(auth(fx.b.schoolAdmin.token))
      .send({ studentId: fx.b.student.id, cycleCode: 'COLLEGE' });
    expect([404, 409]).toContain(res.status);
  });
});
