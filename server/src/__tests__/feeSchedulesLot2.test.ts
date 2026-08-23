import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { getNationalFeeAmount, resolveOfficialRegistrationLine } from '../lib/nationalFees.js';
import {
  createDraftSchedule,
  replaceDraftItems,
  validateSchedule,
  publishSchedule,
  archiveSchedule,
  createRevisedDraft,
  issueInvoiceFromSchedule,
  createPaymentPlanFromTemplate,
} from '../lib/feeSchedules.js';
import { hashPassword } from '../lib/password.js';

describe('feeSchedules + nationalFees (Lot 2)', () => {
  let institutionId: string;
  let actorId: string;
  let studentId: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword('TestLot2!234');
    const institution = await prisma.strkInstitution.create({
      data: {
        name: 'Lot2 Test College',
        type: 'private_school',
        fundingSector: 'private',
      },
    });
    institutionId = institution.id;

    const actor = await prisma.strkProfile.create({
      data: {
        email: `lot2-actor-${Date.now()}@example.test`,
        firstName: 'Compta',
        lastName: 'Test',
        role: 'school_admin',
        institutionId,
        passwordHash,
      },
    });
    actorId = actor.id;

    const studentProfile = await prisma.strkProfile.create({
      data: {
        email: `lot2-student-${Date.now()}@example.test`,
        firstName: 'Eleve',
        lastName: 'Test',
        role: 'student',
        institutionId,
        passwordHash,
      },
    });
    const student = await prisma.strkStudent.create({
      data: { id: studentProfile.id, institutionId },
    });
    studentId = student.id;
  }, 30000);

  afterAll(async () => {
    await prisma.strkInvoice.deleteMany({ where: { institutionId } }).catch(() => {});
    await prisma.strkPaymentPlan.deleteMany({ where: { institutionId } }).catch(() => {});
    await prisma.strkFeePlanTemplateStep.deleteMany({
      where: { template: { institutionId } },
    }).catch(() => {});
    await prisma.strkFeePlanTemplate.deleteMany({ where: { institutionId } }).catch(() => {});
    await prisma.strkFeeScheduleItem.deleteMany({
      where: { feeSchedule: { institutionId } },
    }).catch(() => {});
    await prisma.strkFeeSchedule.deleteMany({ where: { institutionId } }).catch(() => {});
    await prisma.strkStudent.deleteMany({ where: { institutionId } }).catch(() => {});
    await prisma.strkProfile.deleteMany({ where: { institutionId } }).catch(() => {});
    await prisma.strkInstitution.delete({ where: { id: institutionId } }).catch(() => {});
  });

  it('lit le référentiel national CI 2026-2027 (0 / 6000 / 3000)', async () => {
    const collegePrivate = await getNationalFeeAmount({
      countryCode: 'CI',
      academicYear: '2026-2027',
      cycleCode: 'COLLEGE',
      fundingSector: 'private',
    });
    expect(collegePrivate?.amountCents).toBe(3000);

    const collegePublic = await getNationalFeeAmount({
      countryCode: 'CI',
      academicYear: '2026-2027',
      cycleCode: 'COLLEGE',
      fundingSector: 'public',
    });
    expect(collegePublic?.amountCents).toBe(6000);

    const primaryPublic = await resolveOfficialRegistrationLine({
      countryCode: 'CI',
      academicYear: '2026-2027',
      cycleCode: 'PRIMARY',
      fundingSector: 'public',
    });
    expect(primaryPublic).toBeNull();
  });

  it('workflow draft → validated → published + immuabilité des items', async () => {
    const draft = await createDraftSchedule({
      institutionId,
      academicYear: '2026-2027',
      name: 'Grille collège privé',
      createdBy: actorId,
      items: [
        {
          feeTypeCode: 'ANNUAL_TUITION',
          cycleCode: 'COLLEGE',
          feeOrigin: 'institution',
          amountCents: 240000,
        },
      ],
    });
    expect(draft.status).toBe('draft');

    await replaceDraftItems({
      scheduleId: draft.id,
      institutionId,
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
          amountCents: 240000,
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

    const validated = await validateSchedule({
      scheduleId: draft.id,
      institutionId,
      actorId,
    });
    expect(validated.status).toBe('validated');
    expect(validated.validatedBy).toBe(actorId);

    await expect(
      replaceDraftItems({
        scheduleId: draft.id,
        institutionId,
        items: [{ feeTypeCode: 'X', amountCents: 1 }],
      })
    ).rejects.toThrow('SCHEDULE_NOT_DRAFT');

    const published = await publishSchedule({
      scheduleId: draft.id,
      institutionId,
      actorId,
    });
    expect(published.status).toBe('published');
    expect(published.publishedBy).toBe(actorId);

    await expect(
      validateSchedule({ scheduleId: draft.id, institutionId, actorId })
    ).rejects.toThrow('SCHEDULE_NOT_DRAFT');
  });

  it('émet une facture avec snapshot et ignore la cantine non souscrite', async () => {
    const schedule = await prisma.strkFeeSchedule.findFirst({
      where: { institutionId, status: 'published' },
    });
    expect(schedule).not.toBeNull();

    const invoice = await issueInvoiceFromSchedule({
      scheduleId: schedule!.id,
      institutionId,
      studentId,
      createdBy: actorId,
      cycleCode: 'COLLEGE',
      fundingSector: 'private',
    });

    expect(invoice.feeScheduleId).toBe(schedule!.id);
    expect(invoice.feeScheduleVersion).toBe(schedule!.version);
    expect(invoice.tariffSnapshot).toBeTruthy();
    expect(invoice.totalCents).toBe(243000); // 3000 + 240000
    expect(invoice.lines.some((l) => l.feeTypeCode === 'CANTEEN')).toBe(false);
    expect(invoice.lines.some((l) => l.feeOrigin === 'state')).toBe(true);
    expect(invoice.lines.some((l) => l.feeOrigin === 'institution')).toBe(true);

    const withCanteen = await issueInvoiceFromSchedule({
      scheduleId: schedule!.id,
      institutionId,
      studentId,
      createdBy: actorId,
      cycleCode: 'COLLEGE',
      optionalFeeTypeCodes: ['CANTEEN'],
    });
    expect(withCanteen.totalCents).toBe(268000);
  });

  it('crée un plan depuis template % (reste sur dernière échéance)', async () => {
    const template = await prisma.strkFeePlanTemplate.create({
      data: {
        institutionId,
        name: 'Trimestriel',
        currency: 'XOF',
        createdBy: actorId,
        steps: {
          create: [
            { label: 'T1', percent: 34, dueOffsetDays: 0, sortOrder: 0 },
            { label: 'T2', percent: 33, dueOffsetDays: 90, sortOrder: 1 },
            { label: 'T3', percent: 33, dueOffsetDays: 180, sortOrder: 2 },
          ],
        },
      },
      include: { steps: true },
    });

    const plan = await createPaymentPlanFromTemplate({
      templateId: template.id,
      institutionId,
      studentId,
      createdBy: actorId,
      totalCents: 1000,
      baseDueDate: new Date('2026-09-01T00:00:00.000Z'),
    });

    expect(plan.invoices).toHaveLength(3);
    expect(plan.invoices.map((i) => i.totalCents)).toEqual([340, 330, 330]);
    expect(plan.invoices.map((i) => i.installmentIndex)).toEqual([1, 2, 3]);
    expect(plan.planTemplateId).toBe(template.id);
    expect(plan.invoices.reduce((s, i) => s + i.totalCents, 0)).toBe(1000);
  });

  it('révise une grille publiée sans modifier les factures déjà émises', async () => {
    const published = await prisma.strkFeeSchedule.findFirst({
      where: { institutionId, status: 'published' },
    });
    expect(published).not.toBeNull();

    const beforeInvoices = await prisma.strkInvoice.findMany({
      where: { feeScheduleId: published!.id },
      select: { id: true, totalCents: true, tariffSnapshot: true },
    });
    expect(beforeInvoices.length).toBeGreaterThan(0);
    const snapshotBefore = JSON.stringify(beforeInvoices[0].tariffSnapshot);

    const revised = await createRevisedDraft({
      scheduleId: published!.id,
      institutionId,
      createdBy: actorId,
    });
    expect(revised.status).toBe('draft');
    expect(revised.version).toBe(published!.version + 1);
    expect(revised.previousVersionId).toBe(published!.id);

    await replaceDraftItems({
      scheduleId: revised.id,
      institutionId,
      items: [
        {
          feeTypeCode: 'ANNUAL_TUITION',
          cycleCode: 'COLLEGE',
          feeOrigin: 'institution',
          amountCents: 999999,
        },
      ],
    });

    const stillPublished = await prisma.strkFeeSchedule.findUniqueOrThrow({
      where: { id: published!.id },
    });
    expect(stillPublished.status).toBe('published');

    const afterInvoices = await prisma.strkInvoice.findMany({
      where: { id: { in: beforeInvoices.map((i) => i.id) } },
    });
    expect(afterInvoices[0].totalCents).toBe(beforeInvoices[0].totalCents);
    expect(JSON.stringify(afterInvoices[0].tariffSnapshot)).toBe(snapshotBefore);

    await archiveSchedule({ scheduleId: published!.id, institutionId });
    const archived = await prisma.strkFeeSchedule.findUniqueOrThrow({ where: { id: published!.id } });
    expect(archived.status).toBe('archived');

    await expect(
      issueInvoiceFromSchedule({
        scheduleId: published!.id,
        institutionId,
        studentId,
        createdBy: actorId,
        cycleCode: 'COLLEGE',
      })
    ).rejects.toThrow('SCHEDULE_ARCHIVED');
  });
});
