/**
 * Lot 3 — API grille financière (étend le module `/finance`).
 * Auth / feature flag déjà appliqués par `financeRouter`.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireRole } from '../middleware/auth.js';
import {
  FINANCE_ROLES,
  FEE_SCHEDULE_PUBLISH_ROLES,
  isSameInstitution,
} from '../lib/authz.js';
import { logAudit } from '../lib/audit.js';
import { findIdempotentAudit, readIdempotencyKey } from '../lib/idempotency.js';
import { getPublishedNationalFeeVersion } from '../lib/nationalFees.js';
import {
  createDraftSchedule,
  replaceDraftItems,
  validateSchedule,
  publishSchedule,
  archiveSchedule,
  createRevisedDraft,
  issueInvoiceFromSchedule,
  createPaymentPlanFromTemplate,
  upsertStudentFeeAssignment,
  updateStudentFeeAssignmentOptions,
  endStudentFeeAssignment,
  issueInvoiceForAssignment,
  type FeeScheduleItemInput,
} from '../lib/feeSchedules.js';
import type { Adjustment } from '../lib/feeScheduleEngine.js';

export const feeGridRouter = Router();

const scheduleItemSchema = z.object({
  feeTypeId: z.string().uuid().optional().nullable(),
  feeTypeCode: z.string().min(1),
  cycleCode: z.string().optional().nullable(),
  gradeLevelId: z.string().uuid().optional().nullable(),
  enrollmentType: z.string().optional().nullable(),
  studentStatus: z.string().optional().nullable(),
  feeOrigin: z.enum(['state', 'institution']).default('institution'),
  amountCents: z.number().int().nonnegative(),
  currency: z.string().default('XOF'),
  isMandatory: z.boolean().default(true),
  isRefundable: z.boolean().default(false),
  isDiscountable: z.boolean().default(true),
  frequency: z.string().default('annual'),
  sortOrder: z.number().int().optional(),
});

const adjustmentSchema = z.object({
  code: z.string().min(1),
  kind: z.enum(['waiver', 'discount', 'sponsorship', 'penalty', 'credit']),
  label: z.string().min(1),
  amountCents: z.number().int().positive().optional(),
  percent: z.number().int().min(0).max(100).optional(),
  appliesToFeeTypeCodes: z.array(z.string()).optional(),
});

const mapError = (err: unknown): { status: number; error: string; code: string } | null => {
  if (!(err instanceof Error)) return null;
  const code = err.message;
  const table: Record<string, { status: number; error: string }> = {
    SCHEDULE_NOT_FOUND: { status: 404, error: 'Grille introuvable' },
    SCHEDULE_NOT_DRAFT: { status: 409, error: 'La grille n’est plus un brouillon' },
    SCHEDULE_NOT_VALIDATED: { status: 409, error: 'La grille doit être validée avant publication' },
    SCHEDULE_NOT_PUBLISHED: { status: 409, error: 'La grille doit être publiée' },
    SCHEDULE_ARCHIVED: { status: 409, error: 'Grille archivée — plus de nouvelles factures' },
    SCHEDULE_ARCHIVE_DRAFT: { status: 409, error: 'Archiver un brouillon est interdit' },
    SCHEDULE_REVISE_SOURCE_INVALID: { status: 409, error: 'Seule une grille publiée/archivée peut être révisée' },
    INVOICE_EMPTY: { status: 422, error: 'Aucune ligne à facturer' },
    TEMPLATE_NOT_FOUND: { status: 404, error: 'Modèle d’échéancier introuvable' },
    TEMPLATE_EMPTY: { status: 422, error: 'Le modèle n’a aucune échéance' },
    TEMPLATE_STEP_PERCENT_REQUIRED: { status: 422, error: 'Chaque étape doit avoir un pourcentage entier' },
    PLAN_TOTAL_INVALID: { status: 400, error: 'Montant total invalide' },
    INSTALLMENT_PERCENT_SUM: { status: 422, error: 'La somme des pourcentages doit être 100' },
    FEE_TYPE_NOT_FOUND: { status: 404, error: 'Type de frais introuvable' },
    FEE_TYPE_PLATFORM_READONLY: { status: 403, error: 'Le catalogue plateforme n’est pas modifiable' },
    STUDENT_NOT_FOUND: { status: 404, error: 'Élève introuvable' },
    ASSIGNMENT_NOT_FOUND: { status: 404, error: 'Affectation introuvable' },
    ASSIGNMENT_NOT_ACTIVE: { status: 409, error: 'Affectation inactive' },
  };
  const mapped = table[code];
  if (!mapped) return null;
  return { status: mapped.status, error: mapped.error, code };
};

const requireTenant = (auth: { institutionId?: string | null }) => {
  if (!auth.institutionId) {
    return { error: 'Aucun établissement associé à ce compte' as const };
  }
  return { institutionId: auth.institutionId };
};

// --- Types de frais -------------------------------------------------------

feeGridRouter.get('/fee-types', requireRole(...FINANCE_ROLES), async (req, res) => {
  const tenant = requireTenant(req.auth!);
  if ('error' in tenant) return res.status(400).json({ error: tenant.error });

  const feeTypes = await prisma.strkFeeType.findMany({
    where: {
      isActive: true,
      OR: [{ institutionId: null }, { institutionId: tenant.institutionId }],
    },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  });
  res.json({ feeTypes });
});

const feeTypeCreateSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Z][A-Z0-9_]*$/, 'code en majuscules (A-Z0-9_)'),
  label: z.string().min(1),
  category: z.string().min(1),
  frequency: z.string().default('configurable'),
  description: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

feeGridRouter.post('/fee-types', requireRole(...FINANCE_ROLES), async (req, res) => {
  const tenant = requireTenant(req.auth!);
  if ('error' in tenant) return res.status(400).json({ error: tenant.error });
  const parsed = feeTypeCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }

  const exists = await prisma.strkFeeType.findFirst({
    where: {
      code: parsed.data.code,
      OR: [{ institutionId: null }, { institutionId: tenant.institutionId }],
    },
  });
  if (exists) {
    return res.status(409).json({ error: 'Ce code de frais existe déjà', code: 'FEE_TYPE_CODE_EXISTS' });
  }

  const feeType = await prisma.strkFeeType.create({
    data: {
      institutionId: tenant.institutionId,
      code: parsed.data.code,
      label: parsed.data.label,
      category: parsed.data.category,
      frequency: parsed.data.frequency,
      description: parsed.data.description,
      sortOrder: parsed.data.sortOrder ?? 500,
    },
  });
  res.status(201).json({ feeType });
});

feeGridRouter.patch('/fee-types/:id', requireRole(...FINANCE_ROLES), async (req, res) => {
  const tenant = requireTenant(req.auth!);
  if ('error' in tenant) return res.status(400).json({ error: tenant.error });
  const existing = await prisma.strkFeeType.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Type de frais introuvable' });
  if (existing.institutionId == null) {
    return res.status(403).json({ error: 'Le catalogue plateforme n’est pas modifiable', code: 'FEE_TYPE_PLATFORM_READONLY' });
  }
  if (!isSameInstitution(req.auth!, existing.institutionId)) {
    return res.status(404).json({ error: 'Type de frais introuvable' });
  }
  const parsed = feeTypeCreateSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Données invalides' });
  const feeType = await prisma.strkFeeType.update({ where: { id: existing.id }, data: parsed.data });
  res.json({ feeType });
});

feeGridRouter.delete('/fee-types/:id', requireRole(...FINANCE_ROLES), async (req, res) => {
  const tenant = requireTenant(req.auth!);
  if ('error' in tenant) return res.status(400).json({ error: tenant.error });
  const existing = await prisma.strkFeeType.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Type de frais introuvable' });
  if (existing.institutionId == null) {
    return res.status(403).json({ error: 'Le catalogue plateforme n’est pas modifiable', code: 'FEE_TYPE_PLATFORM_READONLY' });
  }
  if (!isSameInstitution(req.auth!, existing.institutionId)) {
    return res.status(404).json({ error: 'Type de frais introuvable' });
  }
  await prisma.strkFeeType.update({ where: { id: existing.id }, data: { isActive: false } });
  res.json({ success: true });
});

// --- Référentiel national (lecture seule) ---------------------------------

feeGridRouter.get('/national-fees', requireRole(...FINANCE_ROLES), async (req, res) => {
  const countryCode = typeof req.query.countryCode === 'string' ? req.query.countryCode : 'CI';
  const academicYear =
    typeof req.query.academicYear === 'string' ? req.query.academicYear : undefined;
  if (!academicYear) {
    return res.status(400).json({ error: 'academicYear requis' });
  }
  const version = await getPublishedNationalFeeVersion(countryCode, academicYear);
  if (!version) {
    return res.status(404).json({ error: 'Aucune version nationale publiée pour cette année' });
  }
  res.json({
    version: {
      id: version.id,
      countryCode: version.countryCode,
      academicYear: version.academicYear,
      currency: version.currency,
      version: version.version,
      status: version.status,
      managedBy: version.managedBy,
      effectiveFrom: version.effectiveFrom,
      source: version.source,
      rates: version.rates,
    },
  });
});

// --- Grilles tarifaires ---------------------------------------------------

feeGridRouter.get('/fee-schedules', requireRole(...FINANCE_ROLES), async (req, res) => {
  const tenant = requireTenant(req.auth!);
  if ('error' in tenant) return res.status(400).json({ error: tenant.error });
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const academicYear = typeof req.query.academicYear === 'string' ? req.query.academicYear : undefined;

  const schedules = await prisma.strkFeeSchedule.findMany({
    where: {
      institutionId: tenant.institutionId,
      ...(status ? { status } : {}),
      ...(academicYear ? { academicYear } : {}),
    },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
    orderBy: [{ academicYear: 'desc' }, { version: 'desc' }],
  });
  res.json({ schedules });
});

feeGridRouter.get('/fee-schedules/:id', requireRole(...FINANCE_ROLES), async (req, res) => {
  const tenant = requireTenant(req.auth!);
  if ('error' in tenant) return res.status(400).json({ error: tenant.error });
  const schedule = await prisma.strkFeeSchedule.findFirst({
    where: { id: req.params.id, institutionId: tenant.institutionId },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!schedule) return res.status(404).json({ error: 'Grille introuvable' });
  res.json({ schedule });
});

const createScheduleSchema = z.object({
  academicYear: z.string().min(1),
  name: z.string().min(1),
  currency: z.string().default('XOF'),
  campusId: z.string().uuid().optional().nullable(),
  items: z.array(scheduleItemSchema).default([]),
});

feeGridRouter.post('/fee-schedules', requireRole(...FINANCE_ROLES), async (req, res) => {
  const tenant = requireTenant(req.auth!);
  if ('error' in tenant) return res.status(400).json({ error: tenant.error });
  const parsed = createScheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  try {
    const schedule = await createDraftSchedule({
      institutionId: tenant.institutionId,
      campusId: parsed.data.campusId,
      academicYear: parsed.data.academicYear,
      name: parsed.data.name,
      currency: parsed.data.currency,
      createdBy: req.auth!.sub,
      items: parsed.data.items as FeeScheduleItemInput[],
    });
    await logAudit({
      institutionId: tenant.institutionId,
      actorId: req.auth!.sub,
      action: 'finance.fee_schedule.created',
      targetType: 'fee_schedule',
      targetId: schedule.id,
      metadata: { academicYear: schedule.academicYear, version: schedule.version },
      ipAddress: req.ip,
    });
    res.status(201).json({ schedule });
  } catch (err) {
    const mapped = mapError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error, code: mapped.code });
    throw err;
  }
});

feeGridRouter.put('/fee-schedules/:id/items', requireRole(...FINANCE_ROLES), async (req, res) => {
  const tenant = requireTenant(req.auth!);
  if ('error' in tenant) return res.status(400).json({ error: tenant.error });
  const parsed = z.object({ items: z.array(scheduleItemSchema) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  try {
    const schedule = await replaceDraftItems({
      scheduleId: req.params.id,
      institutionId: tenant.institutionId,
      items: parsed.data.items as FeeScheduleItemInput[],
    });
    await logAudit({
      institutionId: tenant.institutionId,
      actorId: req.auth!.sub,
      action: 'finance.fee_schedule.items_updated',
      targetType: 'fee_schedule',
      targetId: schedule.id,
      metadata: { itemCount: parsed.data.items.length },
      ipAddress: req.ip,
    });
    res.json({ schedule });
  } catch (err) {
    const mapped = mapError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error, code: mapped.code });
    throw err;
  }
});

feeGridRouter.post('/fee-schedules/:id/validate', requireRole(...FINANCE_ROLES), async (req, res) => {
  const tenant = requireTenant(req.auth!);
  if ('error' in tenant) return res.status(400).json({ error: tenant.error });
  try {
    const schedule = await validateSchedule({
      scheduleId: req.params.id,
      institutionId: tenant.institutionId,
      actorId: req.auth!.sub,
    });
    await logAudit({
      institutionId: tenant.institutionId,
      actorId: req.auth!.sub,
      action: 'finance.fee_schedule.validated',
      targetType: 'fee_schedule',
      targetId: schedule.id,
      ipAddress: req.ip,
    });
    res.json({ schedule });
  } catch (err) {
    const mapped = mapError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error, code: mapped.code });
    throw err;
  }
});

/** Publication — rôles direction uniquement (FEE_SCHEDULE_PUBLISH_ROLES). */
feeGridRouter.post('/fee-schedules/:id/publish', requireRole(...FEE_SCHEDULE_PUBLISH_ROLES), async (req, res) => {
  const tenant = requireTenant(req.auth!);
  if ('error' in tenant) return res.status(400).json({ error: tenant.error });
  const idempotencyKey = readIdempotencyKey(req.header('Idempotency-Key'));
  if (idempotencyKey) {
    const prev = await findIdempotentAudit({
      institutionId: tenant.institutionId,
      action: 'finance.fee_schedule.published',
      idempotencyKey,
    });
    if (prev?.targetId) {
      const schedule = await prisma.strkFeeSchedule.findFirst({
        where: { id: prev.targetId, institutionId: tenant.institutionId },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });
      if (schedule) {
        return res.status(200).json({ schedule, idempotentReplay: true });
      }
    }
  }

  try {
    const schedule = await publishSchedule({
      scheduleId: req.params.id,
      institutionId: tenant.institutionId,
      actorId: req.auth!.sub,
      effectiveFrom: req.body?.effectiveFrom ? new Date(req.body.effectiveFrom) : undefined,
    });
    await logAudit({
      institutionId: tenant.institutionId,
      actorId: req.auth!.sub,
      action: 'finance.fee_schedule.published',
      targetType: 'fee_schedule',
      targetId: schedule.id,
      metadata: { version: schedule.version, ...(idempotencyKey ? { idempotencyKey } : {}) },
      ipAddress: req.ip,
    });
    res.json({ schedule });
  } catch (err) {
    const mapped = mapError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error, code: mapped.code });
    throw err;
  }
});

feeGridRouter.post('/fee-schedules/:id/archive', requireRole(...FINANCE_ROLES), async (req, res) => {
  const tenant = requireTenant(req.auth!);
  if ('error' in tenant) return res.status(400).json({ error: tenant.error });
  try {
    const schedule = await archiveSchedule({
      scheduleId: req.params.id,
      institutionId: tenant.institutionId,
    });
    await logAudit({
      institutionId: tenant.institutionId,
      actorId: req.auth!.sub,
      action: 'finance.fee_schedule.archived',
      targetType: 'fee_schedule',
      targetId: schedule.id,
      ipAddress: req.ip,
    });
    res.json({ schedule });
  } catch (err) {
    const mapped = mapError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error, code: mapped.code });
    throw err;
  }
});

feeGridRouter.post('/fee-schedules/:id/revise', requireRole(...FINANCE_ROLES), async (req, res) => {
  const tenant = requireTenant(req.auth!);
  if ('error' in tenant) return res.status(400).json({ error: tenant.error });
  try {
    const schedule = await createRevisedDraft({
      scheduleId: req.params.id,
      institutionId: tenant.institutionId,
      createdBy: req.auth!.sub,
      name: typeof req.body?.name === 'string' ? req.body.name : undefined,
    });
    await logAudit({
      institutionId: tenant.institutionId,
      actorId: req.auth!.sub,
      action: 'finance.fee_schedule.revised',
      targetType: 'fee_schedule',
      targetId: schedule.id,
      metadata: { previousVersionId: req.params.id, version: schedule.version },
      ipAddress: req.ip,
    });
    res.status(201).json({ schedule });
  } catch (err) {
    const mapped = mapError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error, code: mapped.code });
    throw err;
  }
});

const generateInvoiceSchema = z.object({
  studentId: z.string().uuid(),
  cycleCode: z.string().optional().nullable(),
  gradeLevelId: z.string().uuid().optional().nullable(),
  enrollmentType: z.string().optional().nullable(),
  optionalFeeTypeCodes: z.array(z.string()).optional(),
  includeNationalRegistration: z.boolean().optional(),
  fundingSector: z.enum(['public', 'private', 'mixed']).optional().nullable(),
  countryCode: z.string().optional(),
  dueDate: z.string().optional(),
  adjustments: z.array(adjustmentSchema).optional(),
});

feeGridRouter.post(
  '/fee-schedules/:id/generate-invoice',
  requireRole(...FINANCE_ROLES),
  async (req, res) => {
    const tenant = requireTenant(req.auth!);
    if ('error' in tenant) return res.status(400).json({ error: tenant.error });
    const parsed = generateInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
    }

    const student = await prisma.strkStudent.findUnique({ where: { id: parsed.data.studentId } });
    if (!student || !isSameInstitution(req.auth!, student.institutionId)) {
      return res.status(404).json({ error: 'Élève introuvable' });
    }

    const idempotencyKey = readIdempotencyKey(req.header('Idempotency-Key'));
    if (idempotencyKey) {
      const prev = await findIdempotentAudit({
        institutionId: tenant.institutionId,
        action: 'finance.fee_schedule.invoice_generated',
        idempotencyKey,
      });
      if (prev?.targetId) {
        const invoice = await prisma.strkInvoice.findFirst({
          where: { id: prev.targetId, institutionId: tenant.institutionId },
          include: { lines: true },
        });
        if (invoice) {
          return res.status(200).json({ invoice, idempotentReplay: true });
        }
      }
    }

    const adjustments = (parsed.data.adjustments ?? []) as Adjustment[];
    const exceptional = adjustments.filter(
      (a) => a.kind === 'discount' && (a.code === 'EXCEPTIONAL_DISCOUNT' || a.code.startsWith('EXCEPTIONAL_'))
    );

    try {
      const invoice = await issueInvoiceFromSchedule({
        scheduleId: req.params.id,
        institutionId: tenant.institutionId,
        studentId: student.id,
        createdBy: req.auth!.sub,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
        cycleCode: parsed.data.cycleCode,
        gradeLevelId: parsed.data.gradeLevelId,
        enrollmentType: parsed.data.enrollmentType,
        optionalFeeTypeCodes: parsed.data.optionalFeeTypeCodes,
        includeNationalRegistration: parsed.data.includeNationalRegistration,
        fundingSector: parsed.data.fundingSector,
        countryCode: parsed.data.countryCode,
        adjustments,
      });

      await logAudit({
        institutionId: tenant.institutionId,
        actorId: req.auth!.sub,
        action: 'finance.fee_schedule.invoice_generated',
        targetType: 'invoice',
        targetId: invoice.id,
        metadata: {
          feeScheduleId: req.params.id,
          studentId: student.id,
          totalCents: invoice.totalCents,
          ...(idempotencyKey ? { idempotencyKey } : {}),
        },
        ipAddress: req.ip,
      });

      for (const adj of exceptional) {
        await logAudit({
          institutionId: tenant.institutionId,
          actorId: req.auth!.sub,
          action: 'finance.exceptional_discount.applied',
          targetType: 'invoice',
          targetId: invoice.id,
          metadata: {
            code: adj.code,
            label: adj.label,
            amountCents: adj.amountCents ?? null,
            percent: adj.percent ?? null,
            appliesToFeeTypeCodes: adj.appliesToFeeTypeCodes ?? [],
          },
          ipAddress: req.ip,
        });
      }

      res.status(201).json({ invoice });
    } catch (err) {
      const mapped = mapError(err);
      if (mapped) return res.status(mapped.status).json({ error: mapped.error, code: mapped.code });
      throw err;
    }
  }
);

// --- Templates d’échéancier -----------------------------------------------

feeGridRouter.get('/fee-plan-templates', requireRole(...FINANCE_ROLES), async (req, res) => {
  const tenant = requireTenant(req.auth!);
  if ('error' in tenant) return res.status(400).json({ error: tenant.error });
  const templates = await prisma.strkFeePlanTemplate.findMany({
    where: { institutionId: tenant.institutionId, isActive: true },
    include: { steps: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ templates });
});

const templateSchema = z.object({
  name: z.string().min(1),
  currency: z.string().default('XOF'),
  feeScheduleId: z.string().uuid().optional().nullable(),
  steps: z
    .array(
      z.object({
        label: z.string().min(1),
        percent: z.number().int().min(0).max(100),
        dueOffsetDays: z.number().int().optional().nullable(),
        sortOrder: z.number().int().optional(),
      })
    )
    .min(1),
});

feeGridRouter.post('/fee-plan-templates', requireRole(...FINANCE_ROLES), async (req, res) => {
  const tenant = requireTenant(req.auth!);
  if ('error' in tenant) return res.status(400).json({ error: tenant.error });
  const parsed = templateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const percentSum = parsed.data.steps.reduce((s, st) => s + st.percent, 0);
  if (percentSum !== 100) {
    return res.status(422).json({ error: 'La somme des pourcentages doit être 100', code: 'INSTALLMENT_PERCENT_SUM' });
  }

  const template = await prisma.strkFeePlanTemplate.create({
    data: {
      institutionId: tenant.institutionId,
      name: parsed.data.name,
      currency: parsed.data.currency,
      feeScheduleId: parsed.data.feeScheduleId ?? null,
      createdBy: req.auth!.sub,
      steps: {
        create: parsed.data.steps.map((st, idx) => ({
          label: st.label,
          percent: st.percent,
          dueOffsetDays: st.dueOffsetDays ?? null,
          sortOrder: st.sortOrder ?? idx,
        })),
      },
    },
    include: { steps: { orderBy: { sortOrder: 'asc' } } },
  });
  res.status(201).json({ template });
});

feeGridRouter.delete('/fee-plan-templates/:id', requireRole(...FINANCE_ROLES), async (req, res) => {
  const tenant = requireTenant(req.auth!);
  if ('error' in tenant) return res.status(400).json({ error: tenant.error });
  const existing = await prisma.strkFeePlanTemplate.findFirst({
    where: { id: req.params.id, institutionId: tenant.institutionId },
  });
  if (!existing) return res.status(404).json({ error: 'Modèle introuvable' });
  await prisma.strkFeePlanTemplate.update({ where: { id: existing.id }, data: { isActive: false } });
  res.json({ success: true });
});

const applyTemplateSchema = z.object({
  studentId: z.string().uuid(),
  totalCents: z.number().int().positive(),
  baseDueDate: z.string().min(1),
  label: z.string().optional(),
  academicYear: z.string().optional(),
  scheduleId: z.string().uuid().optional().nullable(),
});

feeGridRouter.post(
  '/fee-plan-templates/:id/apply',
  requireRole(...FINANCE_ROLES),
  async (req, res) => {
    const tenant = requireTenant(req.auth!);
    if ('error' in tenant) return res.status(400).json({ error: tenant.error });
    const parsed = applyTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
    }
    const student = await prisma.strkStudent.findUnique({ where: { id: parsed.data.studentId } });
    if (!student || !isSameInstitution(req.auth!, student.institutionId)) {
      return res.status(404).json({ error: 'Élève introuvable' });
    }
    try {
      const plan = await createPaymentPlanFromTemplate({
        templateId: req.params.id,
        institutionId: tenant.institutionId,
        studentId: student.id,
        createdBy: req.auth!.sub,
        label: parsed.data.label,
        totalCents: parsed.data.totalCents,
        academicYear: parsed.data.academicYear,
        baseDueDate: new Date(parsed.data.baseDueDate),
        scheduleId: parsed.data.scheduleId,
      });
      await logAudit({
        institutionId: tenant.institutionId,
        actorId: req.auth!.sub,
        action: 'finance.fee_plan_template.applied',
        targetType: 'payment_plan',
        targetId: plan.id,
        metadata: { templateId: req.params.id, totalCents: parsed.data.totalCents },
        ipAddress: req.ip,
      });
      res.status(201).json({ plan });
    } catch (err) {
      const mapped = mapError(err);
      if (mapped) return res.status(mapped.status).json({ error: mapped.error, code: mapped.code });
      throw err;
    }
  }
);

// --- Affectations élève → grille (Tranche A) --------------------------------

const assignmentCreateSchema = z.object({
  studentId: z.string().uuid(),
  feeScheduleId: z.string().uuid(),
  academicYear: z.string().min(1),
  cycleCode: z.string().optional().nullable(),
  gradeLevelId: z.string().uuid().optional().nullable(),
  optionalFeeTypeCodes: z.array(z.string()).optional(),
});

const assignmentPatchSchema = z.object({
  optionalFeeTypeCodes: z.array(z.string()).optional(),
  cycleCode: z.string().optional().nullable(),
  gradeLevelId: z.string().uuid().optional().nullable(),
  status: z.enum(['active', 'ended']).optional(),
});

feeGridRouter.get('/student-fee-assignments', requireRole(...FINANCE_ROLES), async (req, res) => {
  const tenant = requireTenant(req.auth!);
  if ('error' in tenant) return res.status(400).json({ error: tenant.error });

  const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined;
  const academicYear = typeof req.query.academicYear === 'string' ? req.query.academicYear : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;

  const assignments = await prisma.strkStudentFeeAssignment.findMany({
    where: {
      institutionId: tenant.institutionId,
      ...(studentId ? { studentId } : {}),
      ...(academicYear ? { academicYear } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: [{ academicYear: 'desc' }, { createdAt: 'desc' }],
    include: {
      student: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
      feeSchedule: { select: { id: true, name: true, version: true, status: true, academicYear: true } },
    },
  });
  res.json({ assignments });
});

feeGridRouter.post('/student-fee-assignments', requireRole(...FINANCE_ROLES), async (req, res) => {
  const tenant = requireTenant(req.auth!);
  if ('error' in tenant) return res.status(400).json({ error: tenant.error });
  const parsed = assignmentCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }

  try {
    const assignment = await upsertStudentFeeAssignment({
      institutionId: tenant.institutionId,
      studentId: parsed.data.studentId,
      feeScheduleId: parsed.data.feeScheduleId,
      academicYear: parsed.data.academicYear,
      cycleCode: parsed.data.cycleCode,
      gradeLevelId: parsed.data.gradeLevelId,
      optionalFeeTypeCodes: parsed.data.optionalFeeTypeCodes,
      createdBy: req.auth!.sub,
    });
    await logAudit({
      institutionId: tenant.institutionId,
      actorId: req.auth!.sub,
      action: 'finance.student_fee_assignment.upserted',
      targetType: 'student_fee_assignment',
      targetId: assignment.id,
      metadata: {
        studentId: assignment.studentId,
        feeScheduleId: assignment.feeScheduleId,
        academicYear: assignment.academicYear,
      },
      ipAddress: req.ip,
    });
    res.status(201).json({ assignment });
  } catch (err) {
    const mapped = mapError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error, code: mapped.code });
    throw err;
  }
});

feeGridRouter.patch('/student-fee-assignments/:id', requireRole(...FINANCE_ROLES), async (req, res) => {
  const tenant = requireTenant(req.auth!);
  if ('error' in tenant) return res.status(400).json({ error: tenant.error });
  const parsed = assignmentPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }

  try {
    const assignment =
      parsed.data.status === 'ended' && Object.keys(parsed.data).length === 1
        ? await endStudentFeeAssignment({
            assignmentId: req.params.id,
            institutionId: tenant.institutionId,
          })
        : await updateStudentFeeAssignmentOptions({
            assignmentId: req.params.id,
            institutionId: tenant.institutionId,
            optionalFeeTypeCodes: parsed.data.optionalFeeTypeCodes,
            cycleCode: parsed.data.cycleCode,
            gradeLevelId: parsed.data.gradeLevelId,
            status: parsed.data.status,
          });
    await logAudit({
      institutionId: tenant.institutionId,
      actorId: req.auth!.sub,
      action: 'finance.student_fee_assignment.updated',
      targetType: 'student_fee_assignment',
      targetId: assignment.id,
      metadata: parsed.data,
      ipAddress: req.ip,
    });
    res.json({ assignment });
  } catch (err) {
    const mapped = mapError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error, code: mapped.code });
    throw err;
  }
});

feeGridRouter.post(
  '/student-fee-assignments/:id/generate-invoice',
  requireRole(...FINANCE_ROLES),
  async (req, res) => {
    const tenant = requireTenant(req.auth!);
    if ('error' in tenant) return res.status(400).json({ error: tenant.error });

    const idempotencyKey = readIdempotencyKey(req.header('Idempotency-Key'));
    if (idempotencyKey) {
      const prev = await findIdempotentAudit({
        institutionId: tenant.institutionId,
        action: 'finance.student_fee_assignment.invoice_generated',
        idempotencyKey,
      });
      if (prev?.targetId) {
        const invoice = await prisma.strkInvoice.findFirst({
          where: { id: prev.targetId, institutionId: tenant.institutionId },
          include: { lines: true },
        });
        if (invoice) {
          return res.status(200).json({ invoice, idempotentReplay: true });
        }
      }
    }

    try {
      const invoice = await issueInvoiceForAssignment({
        assignmentId: req.params.id,
        institutionId: tenant.institutionId,
        createdBy: req.auth!.sub,
      });
      await logAudit({
        institutionId: tenant.institutionId,
        actorId: req.auth!.sub,
        action: 'finance.student_fee_assignment.invoice_generated',
        targetType: 'invoice',
        targetId: invoice.id,
        metadata: {
          assignmentId: req.params.id,
          totalCents: invoice.totalCents,
          ...(idempotencyKey ? { idempotencyKey } : {}),
        },
        ipAddress: req.ip,
      });
      res.status(201).json({ invoice });
    } catch (err) {
      const mapped = mapError(err);
      if (mapped) return res.status(mapped.status).json({ error: mapped.error, code: mapped.code });
      throw err;
    }
  }
);
