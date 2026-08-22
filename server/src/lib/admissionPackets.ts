/**
 * Moteur de pièces d'inscription — catalogue, modèles, règles, complétude, réemploi.
 * Spec : docs/CaddyNote_Gestion_Pieces_Inscription.docx.md
 */
import { prisma } from './prisma.js';
import type {
  StrkAdmissionApplicationKind,
  StrkAdmissionDocItemStatus,
  StrkAdmissionDocObligation,
  StrkAdmissionOriginalMode,
  Prisma,
} from '@prisma/client';

export const PLATFORM_CATALOG: Array<{
  code: string;
  label: string;
  category: string;
  description?: string;
  sortOrder: number;
  validityDays?: number;
}> = [
  { code: 'birth_certificate', label: 'Extrait d’acte de naissance', category: 'civil', sortOrder: 10 },
  { code: 'nationality', label: 'Certificat de nationalité', category: 'civil', sortOrder: 20 },
  { code: 'passport_or_residence', label: 'Passeport ou titre de séjour', category: 'civil', sortOrder: 30 },
  { code: 'report_card', label: 'Bulletin / relevé de notes', category: 'schooling', sortOrder: 40, validityDays: 365 },
  { code: 'school_certificate', label: 'Certificat de scolarité', category: 'schooling', sortOrder: 50, validityDays: 180 },
  { code: 'transfer_form', label: 'Fiche de transfert / radiation', category: 'schooling', sortOrder: 60 },
  { code: 'assignment_sheet', label: 'Fiche d’affectation', category: 'assignment', sortOrder: 70 },
  { code: 'medical_certificate', label: 'Certificat médical', category: 'health', sortOrder: 80, validityDays: 90 },
  { code: 'vaccination', label: 'Carnet / certificat de vaccination', category: 'health', sortOrder: 90 },
  { code: 'guardian_id', label: 'Pièce d’identité du responsable', category: 'guardians', sortOrder: 100 },
  { code: 'proof_of_address', label: 'Justificatif de domicile', category: 'guardians', sortOrder: 110, validityDays: 90 },
  { code: 'parental_auth', label: 'Autorisation parentale', category: 'guardians', sortOrder: 120, validityDays: 365 },
  { code: 'school_insurance', label: 'Attestation d’assurance scolaire', category: 'insurance', sortOrder: 130, validityDays: 365 },
  { code: 'fee_receipt', label: 'Reçu des frais', category: 'payment', sortOrder: 140 },
  { code: 'photo', label: 'Photo d’identité', category: 'other', sortOrder: 150 },
];

const DEFAULT_TEMPLATE_CODES: Array<{
  code: string;
  name: string;
  applicationKind: StrkAdmissionApplicationKind;
  requirementCodes: Array<{
    code: string;
    obligation: StrkAdmissionDocObligation;
    originalMode?: StrkAdmissionOriginalMode;
    conditionRule?: ConditionRule;
  }>;
}> = [
  {
    code: 'pre_registration_default',
    name: 'Préinscription (modèle par défaut)',
    applicationKind: 'pre_registration',
    requirementCodes: [
      { code: 'birth_certificate', obligation: 'required' },
      { code: 'guardian_id', obligation: 'required' },
      { code: 'photo', obligation: 'optional' },
      { code: 'report_card', obligation: 'optional' },
      {
        code: 'passport_or_residence',
        obligation: 'conditional',
        conditionRule: { flags: ['foreign_student'] },
      },
    ],
  },
  {
    code: 'first_enrollment_default',
    name: 'Première inscription (modèle par défaut)',
    applicationKind: 'first_enrollment',
    requirementCodes: [
      { code: 'birth_certificate', obligation: 'required', originalMode: 'copy_then_original' },
      { code: 'guardian_id', obligation: 'required' },
      { code: 'proof_of_address', obligation: 'required' },
      { code: 'medical_certificate', obligation: 'optional' },
      { code: 'photo', obligation: 'required' },
      { code: 'report_card', obligation: 'optional' },
      {
        code: 'assignment_sheet',
        obligation: 'conditional',
        conditionRule: { flags: ['assigned'] },
      },
      {
        code: 'passport_or_residence',
        obligation: 'conditional',
        conditionRule: { flags: ['foreign_student'] },
      },
    ],
  },
  {
    code: 're_enrollment_default',
    name: 'Réinscription (modèle par défaut)',
    applicationKind: 're_enrollment',
    requirementCodes: [
      { code: 'report_card', obligation: 'required' },
      { code: 'fee_receipt', obligation: 'optional' },
      { code: 'photo', obligation: 'optional' },
      { code: 'parental_auth', obligation: 'required' },
      { code: 'school_insurance', obligation: 'optional' },
    ],
  },
  {
    code: 'transfer_default',
    name: 'Transfert (modèle par défaut)',
    applicationKind: 'transfer',
    requirementCodes: [
      { code: 'birth_certificate', obligation: 'required' },
      { code: 'transfer_form', obligation: 'required' },
      { code: 'school_certificate', obligation: 'required' },
      { code: 'guardian_id', obligation: 'required' },
      { code: 'report_card', obligation: 'required' },
    ],
  },
];

/** Règle d’applicabilité d’une pièce conditionnelle. */
export type ConditionRule = {
  applicationKinds?: StrkAdmissionApplicationKind[];
  levels?: string[];
  classIds?: string[];
  flags?: string[];
  /** Si true (défaut), tous les critères présents doivent matcher. */
  requireAll?: boolean;
};

export type PacketRuleContext = {
  applicationKind: StrkAdmissionApplicationKind;
  level?: string | null;
  classId?: string | null;
  profileFlags?: string[];
  now?: Date;
};

export const parseConditionRule = (raw: unknown): ConditionRule | null => {
  if (!raw || typeof raw !== 'object') return null;
  return raw as ConditionRule;
};

export const evaluateConditionRule = (rule: ConditionRule | null | undefined, ctx: PacketRuleContext): boolean => {
  if (!rule) return true;
  const checks: boolean[] = [];
  if (rule.applicationKinds?.length) {
    checks.push(rule.applicationKinds.includes(ctx.applicationKind));
  }
  if (rule.levels?.length) {
    const level = (ctx.level ?? '').toLowerCase();
    checks.push(rule.levels.some((l) => l.toLowerCase() === level));
  }
  if (rule.classIds?.length) {
    checks.push(!!ctx.classId && rule.classIds.includes(ctx.classId));
  }
  if (rule.flags?.length) {
    const flags = new Set((ctx.profileFlags ?? []).map((f) => f.toLowerCase()));
    checks.push(rule.flags.every((f) => flags.has(f.toLowerCase())));
  }
  if (checks.length === 0) return true;
  const requireAll = rule.requireAll !== false;
  return requireAll ? checks.every(Boolean) : checks.some(Boolean);
};

export const isRequirementApplicable = (
  req: {
    obligation: StrkAdmissionDocObligation;
    conditionRule?: unknown;
    depositOpensAt?: Date | null;
    depositClosesAt?: Date | null;
  },
  ctx: PacketRuleContext
): boolean => {
  const now = ctx.now ?? new Date();
  if (req.depositOpensAt && now < req.depositOpensAt) return false;
  if (req.depositClosesAt && now > req.depositClosesAt) return false;
  if (req.obligation !== 'conditional') return true;
  return evaluateConditionRule(parseConditionRule(req.conditionRule), ctx);
};

export const ensurePlatformCatalog = async () => {
  for (const entry of PLATFORM_CATALOG) {
    const existing = await prisma.strkAdmissionDocumentType.findFirst({
      where: { institutionId: null, code: entry.code },
    });
    if (existing) continue;
    await prisma.strkAdmissionDocumentType.create({
      data: {
        institutionId: null,
        code: entry.code,
        label: entry.label,
        category: entry.category,
        description: entry.description,
        sortOrder: entry.sortOrder,
        validityDays: entry.validityDays ?? null,
      },
    });
  }
};

/** Crée les types + modèles par défaut pour un établissement (idempotent). */
export const ensureInstitutionAdmissionPackets = async (institutionId: string) => {
  await ensurePlatformCatalog();

  const platformTypes = await prisma.strkAdmissionDocumentType.findMany({
    where: { institutionId: null, isActive: true },
  });

  for (const pt of platformTypes) {
    const local = await prisma.strkAdmissionDocumentType.findFirst({
      where: { institutionId, code: pt.code },
    });
    if (!local) {
      await prisma.strkAdmissionDocumentType.create({
        data: {
          institutionId,
          code: pt.code,
          label: pt.label,
          description: pt.description,
          category: pt.category,
          allowedMime: pt.allowedMime,
          maxSizeBytes: pt.maxSizeBytes,
          maxFiles: pt.maxFiles,
          validityDays: pt.validityDays,
          sortOrder: pt.sortOrder,
        },
      });
    }
  }

  const localTypes = await prisma.strkAdmissionDocumentType.findMany({
    where: { institutionId, isActive: true },
  });
  const byCode = new Map(localTypes.map((t) => [t.code, t]));

  for (const tpl of DEFAULT_TEMPLATE_CODES) {
    let template = await prisma.strkAdmissionPacketTemplate.findUnique({
      where: { institutionId_code: { institutionId, code: tpl.code } },
    });
    if (!template) {
      template = await prisma.strkAdmissionPacketTemplate.create({
        data: {
          institutionId,
          code: tpl.code,
          name: tpl.name,
          applicationKind: tpl.applicationKind,
          isDefault: true,
          isActive: true,
        },
      });
    }
    for (let i = 0; i < tpl.requirementCodes.length; i++) {
      const req = tpl.requirementCodes[i]!;
      const docType = byCode.get(req.code);
      if (!docType) continue;
      const existing = await prisma.strkAdmissionPacketRequirement.findUnique({
        where: { templateId_documentTypeId: { templateId: template.id, documentTypeId: docType.id } },
      });
      if (!existing) {
        await prisma.strkAdmissionPacketRequirement.create({
          data: {
            templateId: template.id,
            documentTypeId: docType.id,
            obligation: req.obligation,
            originalMode: req.originalMode ?? 'digital_only',
            conditionRule: req.conditionRule ? (req.conditionRule as Prisma.InputJsonValue) : undefined,
            sortOrder: (i + 1) * 10,
          },
        });
      }
    }
  }
};

export const resolvePacketTemplate = async (params: {
  institutionId: string;
  applicationKind: StrkAdmissionApplicationKind;
  classId?: string | null;
  level?: string | null;
  campus?: string | null;
  campusId?: string | null;
  academicYear?: string | null;
}) => {
  await ensureInstitutionAdmissionPackets(params.institutionId);

  const candidates = await prisma.strkAdmissionPacketTemplate.findMany({
    where: {
      institutionId: params.institutionId,
      applicationKind: params.applicationKind,
      isActive: true,
    },
    include: { requirements: { include: { documentType: true }, orderBy: { sortOrder: 'asc' } } },
    orderBy: { updatedAt: 'desc' },
  });

  const scored = candidates
    .map((t) => {
      let score = 0;
      if (params.classId && t.classId === params.classId) score += 8;
      else if (t.classId) score -= 2;
      if (params.level && t.level && t.level.toLowerCase() === params.level.toLowerCase()) score += 4;
      else if (t.level) score -= 1;
      if (params.campusId && t.campusId === params.campusId) score += 5;
      else if (t.campusId) score -= 2;
      else if (params.campus && t.campus && t.campus.toLowerCase() === params.campus.toLowerCase()) score += 4;
      else if (t.campus) score -= 1;
      if (params.academicYear && t.academicYear === params.academicYear) score += 2;
      if (t.isDefault) score += 1;
      return { t, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.t ?? null;
};

const SATISFIED: StrkAdmissionDocItemStatus[] = [
  'uploaded',
  'in_review',
  'compliant',
  'original_pending',
  'finalized',
];

const REUSABLE: StrkAdmissionDocItemStatus[] = ['compliant', 'finalized', 'uploaded', 'in_review', 'original_pending'];

export const computePacketCompleteness = (
  items: Array<{
    status: StrkAdmissionDocItemStatus;
    obligation?: StrkAdmissionDocObligation | null;
    waived?: boolean;
  }>
) => {
  const active = items.filter((i) => !i.waived);
  const required = active.filter((i) => i.obligation === 'required' || i.obligation === 'conditional');
  const optional = active.filter((i) => i.obligation === 'optional');
  const requiredDone = required.filter((i) => SATISFIED.includes(i.status)).length;
  const optionalDone = optional.filter((i) => SATISFIED.includes(i.status)).length;
  const totalWeight = required.length * 2 + optional.length;
  const doneWeight = requiredDone * 2 + optionalDone;
  const percent = totalWeight === 0 ? 100 : Math.round((doneWeight / totalWeight) * 100);
  const missingRequired = required.filter((i) => !SATISFIED.includes(i.status)).length;
  return {
    percent,
    requiredTotal: required.length,
    requiredDone,
    missingRequired,
    optionalTotal: optional.length,
    optionalDone,
    canSubmit: missingRequired === 0,
  };
};

const buildRuleContext = (application: {
  applicationKind: StrkAdmissionApplicationKind;
  level: string | null;
  classId: string | null;
  profileFlags: string[];
}): PacketRuleContext => ({
  applicationKind: application.applicationKind,
  level: application.level,
  classId: application.classId,
  profileFlags: application.profileFlags ?? [],
});

/** Matérialise les lignes de pièces manquantes pour un dossier (règles + originaux). */
export const ensureApplicationPacketItems = async (applicationId: string) => {
  const application = await prisma.strkAdmissionApplication.findUnique({ where: { id: applicationId } });
  if (!application) throw new Error('Dossier introuvable');

  let templateId = application.packetTemplateId;
  if (!templateId) {
    const template = await resolvePacketTemplate({
      institutionId: application.institutionId,
      applicationKind: application.applicationKind,
      classId: application.classId,
      level: application.level,
      campus: application.campus,
      campusId: application.campusId,
      academicYear: application.academicYear,
    });
    if (!template) {
      return { items: [], completeness: computePacketCompleteness([]), template: null, instructionStatus: 'incomplete' };
    }
    templateId = template.id;
    await prisma.strkAdmissionApplication.update({
      where: { id: applicationId },
      data: { packetTemplateId: templateId },
    });
  }

  const template = await prisma.strkAdmissionPacketTemplate.findUnique({
    where: { id: templateId },
    include: { requirements: { include: { documentType: true }, orderBy: { sortOrder: 'asc' } } },
  });
  if (!template) {
    return { items: [], completeness: computePacketCompleteness([]), template: null, instructionStatus: 'incomplete' };
  }

  const ctx = buildRuleContext(application);
  const existing = await prisma.strkAdmissionDocumentItem.findMany({
    where: { applicationId },
    include: { documentType: true, requirement: true },
  });
  const byRequirement = new Map(existing.filter((e) => e.requirementId).map((e) => [e.requirementId!, e]));

  for (const req of template.requirements) {
    const applicable = isRequirementApplicable(req, ctx);
    const current = byRequirement.get(req.id);
    if (!current) {
      if (!applicable) continue;
      const initialStatus: StrkAdmissionDocItemStatus =
        req.originalMode === 'physical_only' ? 'original_pending' : 'missing';
      await prisma.strkAdmissionDocumentItem.create({
        data: {
          applicationId,
          documentTypeId: req.documentTypeId,
          requirementId: req.id,
          status: initialStatus,
          waived: false,
        },
      });
      continue;
    }
    const updates: Prisma.StrkAdmissionDocumentItemUpdateInput = {};
    if (!applicable && !current.waived) updates.waived = true;
    if (applicable && current.waived) updates.waived = false;
    if (
      applicable &&
      req.originalMode === 'physical_only' &&
      current.status === 'missing' &&
      !current.fileKey
    ) {
      updates.status = 'original_pending';
    }
    if (Object.keys(updates).length) {
      await prisma.strkAdmissionDocumentItem.update({ where: { id: current.id }, data: updates });
    }
  }

  await prisma.strkAdmissionDocumentItem.updateMany({
    where: {
      applicationId,
      expiresAt: { lt: new Date() },
      status: { in: ['uploaded', 'in_review', 'compliant', 'original_pending', 'finalized'] },
    },
    data: { status: 'expired' },
  });

  const items = await prisma.strkAdmissionDocumentItem.findMany({
    where: { applicationId },
    include: { documentType: true, requirement: true },
    orderBy: [{ requirement: { sortOrder: 'asc' } }, { createdAt: 'asc' }],
  });

  const completeness = computePacketCompleteness(
    items.map((i) => ({
      status: i.status,
      obligation: i.requirement?.obligation ?? 'optional',
      waived: i.waived,
    }))
  );

  const active = items.filter((i) => !i.waived);
  let instructionStatus = 'incomplete';
  if (completeness.canSubmit && application.status === 'draft') instructionStatus = 'complete';
  else if (['submitted', 'conditionally_accepted'].includes(application.status)) {
    const needsCorrection = active.some((i) =>
      ['non_compliant', 'unreadable', 'expired'].includes(i.status)
    );
    instructionStatus = needsCorrection ? 'correction' : 'in_review';
  } else if (application.status === 'needs_info') instructionStatus = 'correction';
  else if (completeness.canSubmit) instructionStatus = 'complete';

  if (application.instructionStatus !== instructionStatus) {
    await prisma.strkAdmissionApplication.update({
      where: { id: applicationId },
      data: { instructionStatus },
    });
  }

  return { items, completeness, template, instructionStatus };
};

/**
 * Réemploie les pièces encore valides d’un dossier antérieur (réinscription §10).
 * Exclut les pièces expirées ou expirant dans les 30 jours (à renouveler).
 */
export const reuseValidDocumentsFromPrevious = async (applicationId: string) => {
  const application = await prisma.strkAdmissionApplication.findUnique({
    where: { id: applicationId },
  });
  if (!application?.previousApplicationId) return { reused: 0, skippedExpiring: 0 };

  await ensureApplicationPacketItems(applicationId);

  const previousItems = await prisma.strkAdmissionDocumentItem.findMany({
    where: {
      applicationId: application.previousApplicationId,
      waived: false,
      fileKey: { not: null },
      status: { in: REUSABLE },
    },
    include: { documentType: true },
  });

  const currentItems = await prisma.strkAdmissionDocumentItem.findMany({
    where: { applicationId, waived: false },
    include: { documentType: true, requirement: true },
  });

  let reused = 0;
  let skippedExpiring = 0;
  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 86400000);

  for (const item of currentItems) {
    if (item.fileKey || !['missing', 'original_pending'].includes(item.status)) continue;
    if (item.requirement?.originalMode === 'physical_only') continue;

    const match = previousItems.find((p) => p.documentType.code === item.documentType.code);
    if (!match?.fileKey) continue;
    if (match.expiresAt && match.expiresAt < now) {
      skippedExpiring += 1;
      continue;
    }

    const validityDays = item.documentType.validityDays;
    let expiresAt = match.expiresAt;
    if (!expiresAt && validityDays && match.reviewedAt) {
      expiresAt = new Date(match.reviewedAt.getTime() + validityDays * 86400000);
    }
    if (expiresAt && expiresAt < soon) {
      // Bientôt expirée → ne pas réemployer, forcer un renouvellement
      skippedExpiring += 1;
      continue;
    }

    await prisma.strkAdmissionDocumentItem.update({
      where: { id: item.id },
      data: {
        status: match.status === 'compliant' || match.status === 'finalized' ? match.status : 'uploaded',
        fileKey: match.fileKey,
        fileName: match.fileName,
        contentType: match.contentType,
        sizeBytes: match.sizeBytes,
        issuedAt: match.issuedAt ?? match.reviewedAt ?? match.createdAt,
        expiresAt: expiresAt ?? null,
        reusedFromItemId: match.id,
        rejectionReason: null,
      },
    });
    reused += 1;
  }

  const all = await prisma.strkAdmissionDocumentItem.findMany({
    where: { applicationId, fileKey: { not: null }, waived: false },
    include: { documentType: true },
  });
  await prisma.strkAdmissionApplication.update({
    where: { id: applicationId },
    data: {
      documents: all.map((d) => ({
        label: d.documentType.label,
        fileKey: d.fileKey,
        itemId: d.id,
        reused: !!d.reusedFromItemId,
      })),
    },
  });

  return { reused, skippedExpiring };
};

export const markOriginalSeen = async (params: {
  applicationId: string;
  itemId: string;
  actorId: string;
  finalize?: boolean;
}) => {
  const item = await prisma.strkAdmissionDocumentItem.findFirst({
    where: { id: params.itemId, applicationId: params.applicationId },
    include: { requirement: true },
  });
  if (!item) return null;

  const nextStatus =
    params.finalize || item.requirement?.originalMode === 'physical_only'
      ? 'finalized'
      : item.status === 'original_pending'
        ? 'compliant'
        : item.status;

  return prisma.strkAdmissionDocumentItem.update({
    where: { id: item.id },
    data: {
      originalSeenAt: new Date(),
      status: nextStatus,
      reviewedBy: params.actorId,
      reviewedAt: new Date(),
    },
  });
};
