/**
 * Versionnement des grilles tarifaires + émission factures / plans (Lot 2).
 *
 * Workflow (décision §11) : draft → validated → published → archived.
 * Une grille `published` est immuable ; toute correction crée une nouvelle
 * version (`createRevisedDraft`). Les factures déjà émises conservent leur
 * `tariffSnapshot` et ne sont jamais réécrites.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { generateInvoiceNumber } from './canteenBilling.js';
import {
  constituteFeeLines,
  computeNetPayable,
  splitByPercent,
  type Adjustment,
  type ComputedFeeLine,
  type ScheduleItemLike,
} from './feeScheduleEngine.js';
import { resolveOfficialRegistrationLine } from './nationalFees.js';

type Tx = Prisma.TransactionClient;

export type FeeScheduleStatus = 'draft' | 'validated' | 'published' | 'archived';

export type FeeScheduleItemInput = {
  feeTypeId?: string | null;
  feeTypeCode: string;
  cycleCode?: string | null;
  gradeLevelId?: string | null;
  enrollmentType?: string | null;
  studentStatus?: string | null;
  feeOrigin?: string;
  amountCents: number;
  currency?: string;
  isMandatory?: boolean;
  isRefundable?: boolean;
  isDiscountable?: boolean;
  frequency?: string;
  sortOrder?: number;
};

const includeSchedule = {
  items: { orderBy: { sortOrder: 'asc' as const } },
} as const;

function assertDraft(status: string) {
  if (status !== 'draft') throw new Error('SCHEDULE_NOT_DRAFT');
}

function assertStatus(actual: string, expected: string, code: string) {
  if (actual !== expected) throw new Error(code);
}

export async function createDraftSchedule(params: {
  institutionId: string;
  campusId?: string | null;
  academicYear: string;
  name: string;
  currency?: string;
  createdBy: string;
  items?: FeeScheduleItemInput[];
}) {
  return prisma.strkFeeSchedule.create({
    data: {
      institutionId: params.institutionId,
      campusId: params.campusId ?? null,
      academicYear: params.academicYear,
      name: params.name,
      currency: params.currency ?? 'XOF',
      version: 1,
      status: 'draft',
      createdBy: params.createdBy,
      items: params.items?.length
        ? {
            create: params.items.map((item, idx) => ({
              feeTypeId: item.feeTypeId ?? null,
              feeTypeCode: item.feeTypeCode,
              cycleCode: item.cycleCode ?? null,
              gradeLevelId: item.gradeLevelId ?? null,
              enrollmentType: item.enrollmentType ?? null,
              studentStatus: item.studentStatus ?? null,
              feeOrigin: item.feeOrigin ?? 'institution',
              amountCents: item.amountCents,
              currency: item.currency ?? params.currency ?? 'XOF',
              isMandatory: item.isMandatory ?? true,
              isRefundable: item.isRefundable ?? false,
              isDiscountable: item.isDiscountable ?? true,
              frequency: item.frequency ?? 'annual',
              sortOrder: item.sortOrder ?? idx,
            })),
          }
        : undefined,
    },
    include: includeSchedule,
  });
}

/** Remplace intégralement les items d’une grille brouillon (immuabilité hors draft). */
export async function replaceDraftItems(params: {
  scheduleId: string;
  institutionId: string;
  items: FeeScheduleItemInput[];
}) {
  return prisma.$transaction(async (tx) => {
    const schedule = await tx.strkFeeSchedule.findFirst({
      where: { id: params.scheduleId, institutionId: params.institutionId },
    });
    if (!schedule) throw new Error('SCHEDULE_NOT_FOUND');
    assertDraft(schedule.status);

    await tx.strkFeeScheduleItem.deleteMany({ where: { feeScheduleId: schedule.id } });
    if (params.items.length) {
      await tx.strkFeeScheduleItem.createMany({
        data: params.items.map((item, idx) => ({
          feeScheduleId: schedule.id,
          feeTypeId: item.feeTypeId ?? null,
          feeTypeCode: item.feeTypeCode,
          cycleCode: item.cycleCode ?? null,
          gradeLevelId: item.gradeLevelId ?? null,
          enrollmentType: item.enrollmentType ?? null,
          studentStatus: item.studentStatus ?? null,
          feeOrigin: item.feeOrigin ?? 'institution',
          amountCents: item.amountCents,
          currency: item.currency ?? schedule.currency,
          isMandatory: item.isMandatory ?? true,
          isRefundable: item.isRefundable ?? false,
          isDiscountable: item.isDiscountable ?? true,
          frequency: item.frequency ?? 'annual',
          sortOrder: item.sortOrder ?? idx,
        })),
      });
    }
    return tx.strkFeeSchedule.findUniqueOrThrow({
      where: { id: schedule.id },
      include: includeSchedule,
    });
  });
}

/** Comptable : draft → validated. */
export async function validateSchedule(params: {
  scheduleId: string;
  institutionId: string;
  actorId: string;
}) {
  const schedule = await prisma.strkFeeSchedule.findFirst({
    where: { id: params.scheduleId, institutionId: params.institutionId },
  });
  if (!schedule) throw new Error('SCHEDULE_NOT_FOUND');
  assertStatus(schedule.status, 'draft', 'SCHEDULE_NOT_DRAFT');

  return prisma.strkFeeSchedule.update({
    where: { id: schedule.id },
    data: {
      status: 'validated',
      validatedAt: new Date(),
      validatedBy: params.actorId,
    },
    include: includeSchedule,
  });
}

/**
 * Direction : validated → published.
 * Archive toute autre grille `published` du même établissement / année / campus.
 */
export async function publishSchedule(params: {
  scheduleId: string;
  institutionId: string;
  actorId: string;
  effectiveFrom?: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const schedule = await tx.strkFeeSchedule.findFirst({
      where: { id: params.scheduleId, institutionId: params.institutionId },
      include: includeSchedule,
    });
    if (!schedule) throw new Error('SCHEDULE_NOT_FOUND');
    assertStatus(schedule.status, 'validated', 'SCHEDULE_NOT_VALIDATED');

    await tx.strkFeeSchedule.updateMany({
      where: {
        institutionId: params.institutionId,
        academicYear: schedule.academicYear,
        campusId: schedule.campusId,
        status: 'published',
        id: { not: schedule.id },
      },
      data: { status: 'archived' },
    });

    return tx.strkFeeSchedule.update({
      where: { id: schedule.id },
      data: {
        status: 'published',
        publishedAt: new Date(),
        publishedBy: params.actorId,
        effectiveFrom: params.effectiveFrom ?? new Date(),
      },
      include: includeSchedule,
    });
  });
}

export async function archiveSchedule(params: {
  scheduleId: string;
  institutionId: string;
}) {
  const schedule = await prisma.strkFeeSchedule.findFirst({
    where: { id: params.scheduleId, institutionId: params.institutionId },
  });
  if (!schedule) throw new Error('SCHEDULE_NOT_FOUND');
  if (schedule.status === 'archived') return schedule;
  if (schedule.status === 'draft') throw new Error('SCHEDULE_ARCHIVE_DRAFT');

  return prisma.strkFeeSchedule.update({
    where: { id: schedule.id },
    data: { status: 'archived' },
    include: includeSchedule,
  });
}

/**
 * Correction d’une grille publiée : nouvelle version en draft (copie des items).
 * La grille source reste published jusqu’à publication de la successeur
 * (qui l’archivera alors).
 */
export async function createRevisedDraft(params: {
  scheduleId: string;
  institutionId: string;
  createdBy: string;
  name?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const source = await tx.strkFeeSchedule.findFirst({
      where: { id: params.scheduleId, institutionId: params.institutionId },
      include: includeSchedule,
    });
    if (!source) throw new Error('SCHEDULE_NOT_FOUND');
    if (source.status !== 'published' && source.status !== 'archived') {
      throw new Error('SCHEDULE_REVISE_SOURCE_INVALID');
    }

    return tx.strkFeeSchedule.create({
      data: {
        institutionId: source.institutionId,
        campusId: source.campusId,
        academicYear: source.academicYear,
        name: params.name ?? `${source.name} (v${source.version + 1})`,
        currency: source.currency,
        version: source.version + 1,
        status: 'draft',
        previousVersionId: source.id,
        createdBy: params.createdBy,
        items: {
          create: source.items.map((item) => ({
            feeTypeId: item.feeTypeId,
            feeTypeCode: item.feeTypeCode,
            cycleCode: item.cycleCode,
            gradeLevelId: item.gradeLevelId,
            enrollmentType: item.enrollmentType,
            studentStatus: item.studentStatus,
            feeOrigin: item.feeOrigin,
            amountCents: item.amountCents,
            currency: item.currency,
            isMandatory: item.isMandatory,
            isRefundable: item.isRefundable,
            isDiscountable: item.isDiscountable,
            frequency: item.frequency,
            sortOrder: item.sortOrder,
          })),
        },
      },
      include: includeSchedule,
    });
  });
}

async function loadFeeTypeLabels(codes: string[]): Promise<Map<string, string>> {
  if (codes.length === 0) return new Map();
  const types = await prisma.strkFeeType.findMany({
    where: { institutionId: null, code: { in: codes } },
    select: { code: true, label: true },
  });
  return new Map(types.map((t) => [t.code, t.label]));
}

function toScheduleItemLikes(
  items: {
    id: string;
    feeTypeCode: string;
    cycleCode: string | null;
    gradeLevelId: string | null;
    enrollmentType: string | null;
    studentStatus: string | null;
    feeOrigin: string;
    amountCents: number;
    currency: string;
    isMandatory: boolean;
    isDiscountable: boolean;
  }[],
  labels: Map<string, string>
): ScheduleItemLike[] {
  return items.map((item) => ({
    id: item.id,
    feeTypeCode: item.feeTypeCode,
    label: labels.get(item.feeTypeCode) ?? item.feeTypeCode,
    cycleCode: item.cycleCode,
    gradeLevelId: item.gradeLevelId,
    enrollmentType: item.enrollmentType,
    studentStatus: item.studentStatus,
    feeOrigin: item.feeOrigin,
    amountCents: item.amountCents,
    currency: item.currency,
    isMandatory: item.isMandatory,
    isDiscountable: item.isDiscountable,
  }));
}

export type BuildStudentChargesParams = {
  scheduleId: string;
  institutionId: string;
  cycleCode?: string | null;
  gradeLevelId?: string | null;
  enrollmentType?: string | null;
  studentStatus?: string | null;
  optionalFeeTypeCodes?: string[];
  adjustments?: Adjustment[];
  /** Si true, injecte le frais officiel national s’il n’est pas déjà dans la grille. */
  includeNationalRegistration?: boolean;
  countryCode?: string;
  fundingSector?: string | null;
  academicYear?: string;
};

/**
 * Constitute + national + computeNetPayable pour un contexte élève.
 * Refuse d’émettre depuis une grille non publiée.
 */
export async function buildStudentCharges(params: BuildStudentChargesParams) {
  const schedule = await prisma.strkFeeSchedule.findFirst({
    where: { id: params.scheduleId, institutionId: params.institutionId },
    include: includeSchedule,
  });
  if (!schedule) throw new Error('SCHEDULE_NOT_FOUND');
  if (schedule.status === 'archived') throw new Error('SCHEDULE_ARCHIVED');
  if (schedule.status !== 'published') throw new Error('SCHEDULE_NOT_PUBLISHED');

  const labels = await loadFeeTypeLabels(schedule.items.map((i) => i.feeTypeCode));
  let feeLines = constituteFeeLines({
    scheduleItems: toScheduleItemLikes(schedule.items, labels),
    cycleCode: params.cycleCode,
    gradeLevelId: params.gradeLevelId,
    enrollmentType: params.enrollmentType,
    studentStatus: params.studentStatus,
    optionalFeeTypeCodes: params.optionalFeeTypeCodes,
  });

  if (params.includeNationalRegistration && params.fundingSector && params.cycleCode) {
    const already = feeLines.some((l) => l.feeTypeCode === 'STATE_REGISTRATION');
    if (!already) {
      const official = await resolveOfficialRegistrationLine({
        countryCode: params.countryCode ?? 'CI',
        academicYear: params.academicYear ?? schedule.academicYear,
        cycleCode: params.cycleCode,
        fundingSector: params.fundingSector,
      });
      if (official) {
        feeLines = [
          {
            ...official,
            isDiscountable: false,
            lineType: 'fee',
            source: 'national',
          },
          ...feeLines,
        ];
      }
    }
  }

  const computed = computeNetPayable({
    feeLines,
    adjustments: params.adjustments,
  });

  return { schedule, computed };
}

function snapshotFrom(params: {
  schedule: { id: string; version: number; name: string; academicYear: string; currency: string };
  computed: { lines: ComputedFeeLine[]; netCents: number; stateCents: number; institutionCents: number };
}): Prisma.InputJsonValue {
  return {
    feeScheduleId: params.schedule.id,
    feeScheduleVersion: params.schedule.version,
    scheduleName: params.schedule.name,
    academicYear: params.schedule.academicYear,
    currency: params.schedule.currency,
    netCents: params.computed.netCents,
    stateCents: params.computed.stateCents,
    institutionCents: params.computed.institutionCents,
    lines: params.computed.lines.map((l) => ({
      feeTypeCode: l.feeTypeCode,
      label: l.label,
      amountCents: l.amountCents,
      currency: l.currency,
      feeOrigin: l.feeOrigin,
      lineType: l.lineType,
      feeScheduleItemId: l.feeScheduleItemId ?? null,
      source: l.source ?? null,
    })),
  };
}

/** Émet une facture unique à partir d’une grille publiée (snapshot figé). */
export async function issueInvoiceFromSchedule(params: {
  scheduleId: string;
  institutionId: string;
  studentId: string;
  createdBy: string;
  dueDate?: Date;
  cycleCode?: string | null;
  gradeLevelId?: string | null;
  enrollmentType?: string | null;
  optionalFeeTypeCodes?: string[];
  adjustments?: Adjustment[];
  includeNationalRegistration?: boolean;
  fundingSector?: string | null;
  countryCode?: string;
}) {
  const { schedule, computed } = await buildStudentCharges({
    scheduleId: params.scheduleId,
    institutionId: params.institutionId,
    cycleCode: params.cycleCode,
    gradeLevelId: params.gradeLevelId,
    enrollmentType: params.enrollmentType,
    optionalFeeTypeCodes: params.optionalFeeTypeCodes,
    adjustments: params.adjustments,
    includeNationalRegistration: params.includeNationalRegistration,
    fundingSector: params.fundingSector,
    countryCode: params.countryCode,
  });

  if (computed.lines.length === 0 || computed.netCents < 0) {
    throw new Error('INVOICE_EMPTY');
  }

  return prisma.strkInvoice.create({
    data: {
      institutionId: params.institutionId,
      studentId: params.studentId,
      invoiceNumber: generateInvoiceNumber(),
      totalCents: computed.netCents,
      currency: schedule.currency,
      dueDate: params.dueDate,
      createdBy: params.createdBy,
      feeScheduleId: schedule.id,
      feeScheduleVersion: schedule.version,
      tariffSnapshot: snapshotFrom({ schedule, computed }),
      lines: {
        create: computed.lines.map((l) => ({
          label: l.label,
          amountCents: l.amountCents,
          quantity: 1,
          lineType: l.lineType,
          feeTypeCode: l.feeTypeCode,
          feeOrigin: l.feeOrigin,
          feeScheduleItemId: l.feeScheduleItemId ?? null,
        })),
      },
    },
    include: { lines: true },
  });
}

/**
 * Crée un StrkPaymentPlan + N factures (installmentIndex) depuis un template %.
 * Somme des % = 100 ; reste d’arrondi sur la dernière échéance.
 */
export async function createPaymentPlanFromTemplate(params: {
  templateId: string;
  institutionId: string;
  studentId: string;
  createdBy: string;
  label?: string;
  totalCents: number;
  academicYear?: string;
  baseDueDate: Date;
  scheduleId?: string | null;
}) {
  if (!Number.isInteger(params.totalCents) || params.totalCents <= 0) {
    throw new Error('PLAN_TOTAL_INVALID');
  }

  const template = await prisma.strkFeePlanTemplate.findFirst({
    where: { id: params.templateId, institutionId: params.institutionId, isActive: true },
    include: { steps: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!template) throw new Error('TEMPLATE_NOT_FOUND');
  if (template.steps.length === 0) throw new Error('TEMPLATE_EMPTY');

  const percents = template.steps.map((s) => {
    if (s.percent == null || !Number.isInteger(s.percent)) {
      throw new Error('TEMPLATE_STEP_PERCENT_REQUIRED');
    }
    return s.percent;
  });
  const amounts = splitByPercent(params.totalCents, percents);

  return prisma.$transaction(async (tx: Tx) => {
    const plan = await tx.strkPaymentPlan.create({
      data: {
        institutionId: params.institutionId,
        studentId: params.studentId,
        label: params.label ?? template.name,
        currency: template.currency,
        totalCents: params.totalCents,
        academicYear: params.academicYear,
        createdBy: params.createdBy,
        feeScheduleId: params.scheduleId ?? template.feeScheduleId,
        planTemplateId: template.id,
      },
    });

    for (let i = 0; i < template.steps.length; i++) {
      const step = template.steps[i];
      const due = new Date(params.baseDueDate);
      if (step.dueOffsetDays != null) {
        due.setUTCDate(due.getUTCDate() + step.dueOffsetDays);
      }
      await tx.strkInvoice.create({
        data: {
          institutionId: params.institutionId,
          studentId: params.studentId,
          invoiceNumber: generateInvoiceNumber(),
          totalCents: amounts[i],
          currency: template.currency,
          dueDate: due,
          createdBy: params.createdBy,
          paymentPlanId: plan.id,
          installmentIndex: i + 1,
          feeScheduleId: params.scheduleId ?? template.feeScheduleId,
          lines: {
            create: [
              {
                label: step.label || `${template.name} — échéance ${i + 1}`,
                amountCents: amounts[i],
                quantity: 1,
                lineType: 'fee',
              },
            ],
          },
        },
      });
    }

    return tx.strkPaymentPlan.findUniqueOrThrow({
      where: { id: plan.id },
      include: { invoices: { orderBy: { installmentIndex: 'asc' }, include: { lines: true } } },
    });
  });
}

// --- Affectations élève → grille (Tranche A) ---------------------------------

function parseOptionalCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

/** Résout un code cycle à partir d’un libellé admission / niveau libre. */
export function resolveCycleCodeFromLabel(level?: string | null): string | null {
  if (!level?.trim()) return null;
  const up = level.trim().toUpperCase();
  if (['PRESCHOOL', 'PRIMARY', 'COLLEGE', 'LYCEE'].includes(up)) return up;
  const low = level.toLowerCase();
  if (low.includes('préscol') || low.includes('prescol') || low.includes('matern')) return 'PRESCHOOL';
  if (low.includes('prim')) return 'PRIMARY';
  if (low.includes('coll')) return 'COLLEGE';
  if (low.includes('lyc')) return 'LYCEE';
  return null;
}

export async function findPublishedScheduleForYear(params: {
  institutionId: string;
  academicYear: string;
  scheduleId?: string;
}) {
  if (params.scheduleId) {
    const schedule = await prisma.strkFeeSchedule.findFirst({
      where: {
        id: params.scheduleId,
        institutionId: params.institutionId,
        status: 'published',
      },
    });
    if (!schedule) throw new Error('SCHEDULE_NOT_PUBLISHED');
    return schedule;
  }
  return prisma.strkFeeSchedule.findFirst({
    where: {
      institutionId: params.institutionId,
      academicYear: params.academicYear,
      status: 'published',
    },
    orderBy: { version: 'desc' },
  });
}

export async function upsertStudentFeeAssignment(params: {
  institutionId: string;
  studentId: string;
  feeScheduleId: string;
  academicYear: string;
  cycleCode?: string | null;
  gradeLevelId?: string | null;
  optionalFeeTypeCodes?: string[];
  createdBy: string;
}) {
  const schedule = await prisma.strkFeeSchedule.findFirst({
    where: { id: params.feeScheduleId, institutionId: params.institutionId },
  });
  if (!schedule) throw new Error('SCHEDULE_NOT_FOUND');
  if (schedule.status !== 'published') throw new Error('SCHEDULE_NOT_PUBLISHED');

  const student = await prisma.strkStudent.findFirst({
    where: { id: params.studentId, institutionId: params.institutionId },
  });
  if (!student) throw new Error('STUDENT_NOT_FOUND');

  const existing = await prisma.strkStudentFeeAssignment.findFirst({
    where: {
      studentId: params.studentId,
      academicYear: params.academicYear,
      status: 'active',
    },
  });

  const optionalFeeTypeCodes = params.optionalFeeTypeCodes ?? [];

  if (existing) {
    return prisma.strkStudentFeeAssignment.update({
      where: { id: existing.id },
      data: {
        feeScheduleId: params.feeScheduleId,
        cycleCode: params.cycleCode ?? existing.cycleCode,
        gradeLevelId: params.gradeLevelId === undefined ? existing.gradeLevelId : params.gradeLevelId,
        optionalFeeTypeCodes,
      },
    });
  }

  return prisma.strkStudentFeeAssignment.create({
    data: {
      institutionId: params.institutionId,
      studentId: params.studentId,
      feeScheduleId: params.feeScheduleId,
      academicYear: params.academicYear,
      cycleCode: params.cycleCode ?? null,
      gradeLevelId: params.gradeLevelId ?? null,
      optionalFeeTypeCodes,
      status: 'active',
      createdBy: params.createdBy,
    },
  });
}

export async function endStudentFeeAssignment(params: {
  assignmentId: string;
  institutionId: string;
}) {
  const assignment = await prisma.strkStudentFeeAssignment.findFirst({
    where: { id: params.assignmentId, institutionId: params.institutionId },
  });
  if (!assignment) throw new Error('ASSIGNMENT_NOT_FOUND');
  if (assignment.status !== 'active') throw new Error('ASSIGNMENT_NOT_ACTIVE');
  return prisma.strkStudentFeeAssignment.update({
    where: { id: assignment.id },
    data: { status: 'ended', endedAt: new Date() },
  });
}

export async function updateStudentFeeAssignmentOptions(params: {
  assignmentId: string;
  institutionId: string;
  optionalFeeTypeCodes?: string[];
  cycleCode?: string | null;
  gradeLevelId?: string | null;
  status?: 'active' | 'ended';
}) {
  const assignment = await prisma.strkStudentFeeAssignment.findFirst({
    where: { id: params.assignmentId, institutionId: params.institutionId },
  });
  if (!assignment) throw new Error('ASSIGNMENT_NOT_FOUND');

  if (params.status === 'ended') {
    return endStudentFeeAssignment({
      assignmentId: params.assignmentId,
      institutionId: params.institutionId,
    });
  }

  if (assignment.status !== 'active') throw new Error('ASSIGNMENT_NOT_ACTIVE');

  return prisma.strkStudentFeeAssignment.update({
    where: { id: assignment.id },
    data: {
      optionalFeeTypeCodes:
        params.optionalFeeTypeCodes !== undefined
          ? params.optionalFeeTypeCodes
          : undefined,
      cycleCode: params.cycleCode === undefined ? undefined : params.cycleCode,
      gradeLevelId: params.gradeLevelId === undefined ? undefined : params.gradeLevelId,
    },
  });
}

export async function issueInvoiceForAssignment(params: {
  assignmentId: string;
  institutionId: string;
  createdBy: string;
  dueDate?: Date;
  adjustments?: Adjustment[];
  includeNationalRegistration?: boolean;
  countryCode?: string;
}) {
  const assignment = await prisma.strkStudentFeeAssignment.findFirst({
    where: { id: params.assignmentId, institutionId: params.institutionId },
  });
  if (!assignment) throw new Error('ASSIGNMENT_NOT_FOUND');
  if (assignment.status !== 'active') throw new Error('ASSIGNMENT_NOT_ACTIVE');

  const institution = await prisma.strkInstitution.findUniqueOrThrow({
    where: { id: params.institutionId },
    select: { fundingSector: true },
  });

  const fundingSector = institution.fundingSector;
  const includeNational =
    params.includeNationalRegistration ??
    (fundingSector === 'public' || fundingSector === 'private');

  return issueInvoiceFromSchedule({
    scheduleId: assignment.feeScheduleId,
    institutionId: params.institutionId,
    studentId: assignment.studentId,
    createdBy: params.createdBy,
    dueDate: params.dueDate,
    cycleCode: assignment.cycleCode,
    gradeLevelId: assignment.gradeLevelId,
    optionalFeeTypeCodes: parseOptionalCodes(assignment.optionalFeeTypeCodes),
    adjustments: params.adjustments,
    includeNationalRegistration: includeNational,
    fundingSector,
    countryCode: params.countryCode ?? 'CI',
  });
}

/**
 * Après enroll admissions : crée l’affectation si grille publiée, facture si demandé.
 * Ne fait jamais échouer l’inscription si aucune grille.
 */
export async function maybeAssignAndInvoiceAfterEnroll(params: {
  institutionId: string;
  studentId: string;
  academicYear: string;
  createdBy: string;
  cycleCode?: string | null;
  gradeLevelId?: string | null;
  feeScheduleId?: string;
  optionalFeeTypeCodes?: string[];
  generateFeeInvoice?: boolean;
}): Promise<{
  assignmentId: string | null;
  invoiceId: string | null;
  skippedReason: string | null;
}> {
  const schedule = await findPublishedScheduleForYear({
    institutionId: params.institutionId,
    academicYear: params.academicYear,
    scheduleId: params.feeScheduleId,
  }).catch((err: unknown) => {
    if (err instanceof Error && err.message === 'SCHEDULE_NOT_PUBLISHED') return null;
    throw err;
  });

  if (!schedule) {
    return { assignmentId: null, invoiceId: null, skippedReason: 'no_published_schedule' };
  }

  const assignment = await upsertStudentFeeAssignment({
    institutionId: params.institutionId,
    studentId: params.studentId,
    feeScheduleId: schedule.id,
    academicYear: params.academicYear,
    cycleCode: params.cycleCode ?? null,
    gradeLevelId: params.gradeLevelId ?? null,
    optionalFeeTypeCodes: params.optionalFeeTypeCodes ?? [],
    createdBy: params.createdBy,
  });

  const generate = params.generateFeeInvoice !== false;
  if (!generate) {
    return { assignmentId: assignment.id, invoiceId: null, skippedReason: 'invoice_disabled' };
  }

  try {
    const invoice = await issueInvoiceForAssignment({
      assignmentId: assignment.id,
      institutionId: params.institutionId,
      createdBy: params.createdBy,
    });
    return { assignmentId: assignment.id, invoiceId: invoice.id, skippedReason: null };
  } catch (err) {
    if (err instanceof Error && err.message === 'INVOICE_EMPTY') {
      return { assignmentId: assignment.id, invoiceId: null, skippedReason: 'invoice_empty' };
    }
    throw err;
  }
}

