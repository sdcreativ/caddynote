import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';
import {
  createDraftSchedule,
  validateSchedule,
  publishSchedule,
} from '../lib/feeSchedules.js';
import { fillRequiredAdmissionPacket } from './admissionPacketFill.js';

/**
 * Tranche A — affectations élève→grille + pont admissions enroll.
 */
describe('Student fee assignments (Tranche A)', () => {
  let fx: Fixture;
  let scheduleId: string;

  beforeAll(async () => {
    fx = await buildFixture();
    await request(app)
      .put(`/institutions/${fx.a.institutionId}/features/finance`)
      .set(auth(fx.globalAdmin.token))
      .send({ enabled: true });
    await request(app)
      .put(`/institutions/${fx.a.institutionId}/features/admissions`)
      .set(auth(fx.globalAdmin.token))
      .send({ enabled: true });
    await request(app)
      .put(`/institutions/${fx.b.institutionId}/features/admissions`)
      .set(auth(fx.globalAdmin.token))
      .send({ enabled: true });

    await prisma.strkInstitution.update({
      where: { id: fx.a.institutionId },
      data: { fundingSector: 'private' },
    });

    const draft = await createDraftSchedule({
      institutionId: fx.a.institutionId,
      academicYear: '2026-2027',
      name: `Assign ${Date.now()}`,
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
          amountCents: 100000,
        },
        {
          feeTypeCode: 'CANTEEN',
          cycleCode: 'COLLEGE',
          feeOrigin: 'institution',
          amountCents: 25000,
          isMandatory: false,
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
  }, 90000);

  afterAll(async () => {
    await prisma.strkInvoice
      .deleteMany({ where: { institutionId: fx.a.institutionId, feeScheduleId: scheduleId } })
      .catch(() => {});
    await prisma.strkStudentFeeAssignment
      .deleteMany({ where: { institutionId: fx.a.institutionId } })
      .catch(() => {});
    await prisma.strkFeeScheduleItem.deleteMany({ where: { feeScheduleId: scheduleId } }).catch(() => {});
    await prisma.strkFeeSchedule.deleteMany({ where: { id: scheduleId } }).catch(() => {});
  });

  it('enseignant ne liste pas les affectations', async () => {
    const res = await request(app)
      .get('/finance/student-fee-assignments')
      .set(auth(fx.a.teacher.token));
    expect(res.status).toBe(403);
  });

  it('crée une affectation sans cantine puis facture sans ligne cantine', async () => {
    const created = await request(app)
      .post('/finance/student-fee-assignments')
      .set(auth(fx.a.schoolAdmin.token))
      .send({
        studentId: fx.a.student.id,
        feeScheduleId: scheduleId,
        academicYear: '2026-2027',
        cycleCode: 'COLLEGE',
        optionalFeeTypeCodes: [],
      });
    expect(created.status).toBe(201);
    const assignmentId = created.body.assignment.id as string;

    const invoice = await request(app)
      .post(`/finance/student-fee-assignments/${assignmentId}/generate-invoice`)
      .set(auth(fx.a.schoolAdmin.token))
      .set('Idempotency-Key', `assign-inv-${assignmentId}`)
      .send({});
    expect(invoice.status).toBe(201);
    expect(invoice.body.invoice.totalCents).toBe(103000);
    expect(invoice.body.invoice.lines.some((l: { feeTypeCode?: string }) => l.feeTypeCode === 'CANTEEN')).toBe(
      false
    );

    const replay = await request(app)
      .post(`/finance/student-fee-assignments/${assignmentId}/generate-invoice`)
      .set(auth(fx.a.schoolAdmin.token))
      .set('Idempotency-Key', `assign-inv-${assignmentId}`)
      .send({});
    expect(replay.status).toBe(200);
    expect(replay.body.idempotentReplay).toBe(true);
  });

  it('inclut la cantine seulement si option souscrite', async () => {
    const patched = await request(app)
      .patch(
        `/finance/student-fee-assignments/${
          (
            await prisma.strkStudentFeeAssignment.findFirstOrThrow({
              where: { studentId: fx.a.student.id, status: 'active' },
            })
          ).id
        }`
      )
      .set(auth(fx.a.schoolAdmin.token))
      .send({ optionalFeeTypeCodes: ['CANTEEN'] });
    expect(patched.status).toBe(200);

    const invoice = await request(app)
      .post(`/finance/student-fee-assignments/${patched.body.assignment.id}/generate-invoice`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({});
    expect(invoice.status).toBe(201);
    expect(invoice.body.invoice.totalCents).toBe(128000);
    expect(invoice.body.invoice.lines.some((l: { feeTypeCode?: string }) => l.feeTypeCode === 'CANTEEN')).toBe(
      true
    );
  });

  it('isole le tenant B', async () => {
    const assignment = await prisma.strkStudentFeeAssignment.findFirst({
      where: { institutionId: fx.a.institutionId, status: 'active' },
    });
    expect(assignment).toBeTruthy();
    const leak = await request(app)
      .get('/finance/student-fee-assignments')
      .set(auth(fx.b.schoolAdmin.token));
    expect(leak.status).toBe(200);
    expect(leak.body.assignments.every((a: { id: string }) => a.id !== assignment!.id)).toBe(true);

    const inv = await request(app)
      .post(`/finance/student-fee-assignments/${assignment!.id}/generate-invoice`)
      .set(auth(fx.b.schoolAdmin.token))
      .send({});
    expect([403, 404]).toContain(inv.status);
  });

  it('enroll sans grille publiée → 201 sans facture', async () => {
    const year = `2099-${Date.now().toString().slice(-4)}`;
    const stamp = Date.now();
    const created = await request(app).post('/admissions').send({
      institutionId: fx.b.institutionId,
      classId: fx.b.classId,
      academicYear: year,
      studentFirstName: 'Sans',
      studentLastName: 'Grille',
      studentBirthDate: '2012-01-01',
      studentGender: 'female',
      contactEmail: `sans.grille.${stamp}@isolation.test`,
      guardians: [
        {
          firstName: 'Parent',
          lastName: 'B',
          email: `parent.b.${stamp}@isolation.test`,
          relationship: 'mother',
        },
      ],
      level: 'Collège',
    });
    expect(created.status).toBe(201);
    const token = created.body.application.publicToken as string;
    await fillRequiredAdmissionPacket(app, token);
    await request(app).post(`/admissions/status/${token}/submit`).send({});

    const enroll = await request(app)
      .post(`/admissions/${created.body.application.id}/enroll`)
      .set(auth(fx.b.schoolAdmin.token))
      .send({ generateFeeInvoice: true });
    expect(enroll.status).toBe(201);
    expect(enroll.body.studentId).toBeTruthy();
    expect(enroll.body.feeInvoiceId ?? null).toBeNull();
    expect(enroll.body.feeSkippedReason).toBe('no_published_schedule');
  });

  it('enroll avec grille publiée → affectation + facture', async () => {
    const stamp = Date.now();
    const created = await request(app).post('/admissions').send({
      institutionId: fx.a.institutionId,
      classId: fx.a.classId,
      academicYear: '2026-2027',
      studentFirstName: 'Avec',
      studentLastName: 'Grille',
      studentBirthDate: '2011-05-05',
      studentGender: 'male',
      contactEmail: `avec.grille.${stamp}@isolation.test`,
      guardians: [
        {
          firstName: 'Parent',
          lastName: 'A',
          email: `parent.a.${stamp}@isolation.test`,
          relationship: 'father',
        },
      ],
      level: 'Collège',
    });
    expect(created.status).toBe(201);
    const token = created.body.application.publicToken as string;
    await fillRequiredAdmissionPacket(app, token);
    await request(app).post(`/admissions/status/${token}/submit`).send({});

    const enroll = await request(app)
      .post(`/admissions/${created.body.application.id}/enroll`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ cycleCode: 'COLLEGE', optionalFeeTypeCodes: [] });
    expect(enroll.status).toBe(201);
    expect(enroll.body.feeAssignmentId).toBeTruthy();
    expect(enroll.body.feeInvoiceId).toBeTruthy();

    const invoice = await prisma.strkInvoice.findUnique({
      where: { id: enroll.body.feeInvoiceId },
      include: { lines: true },
    });
    expect(invoice?.feeScheduleId).toBe(scheduleId);
    expect(invoice?.totalCents).toBe(103000);
  });
});
