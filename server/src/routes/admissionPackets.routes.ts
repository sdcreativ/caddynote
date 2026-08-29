/**
 * Routes API — moteur de pièces d'inscription (spec complète).
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireFeature } from '../middleware/requireFeature.js';
import { isSameInstitution, SECRETARIAT_ROLES } from '../lib/authz.js';
import { buildObjectKey, createPresignedUploadPost, isS3Configured, getPresignedDownloadUrl } from '../lib/s3.js';
import { STORAGE_FOLDER } from '../lib/storageFolders.js';
import { getFileStorageMode, getStoredObjectBytes, deleteStoredObject, ensureStoredObjectEncrypted } from '../lib/fileStorage.js';
import { AntivirusGateError, assertCleanUpload } from '../lib/antivirus.js';
import { isOptimizableImageMime, withWebpExtension } from '../lib/imageOptimize.js';
import { logAudit } from '../lib/audit.js';
import {
  ensureApplicationPacketItems,
  ensureInstitutionAdmissionPackets,
  ensurePlatformCatalog,
  markOriginalSeen,
  reuseValidDocumentsFromPrevious,
  type ConditionRule,
} from '../lib/admissionPackets.js';
import { notifyAdmissionContact, pickGuardianPhone } from '../lib/admissionFollowUp.js';
import {
  ensureDefaultRejectionReasons,
  getAdmissionInstitutionPolicy,
  setAdmissionInstitutionPolicy,
} from '../lib/admissionSettings.js';

const ADMISSION_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
const MAX_BYTES = 15 * 1024 * 1024;

const conditionRuleSchema = z
  .object({
    applicationKinds: z
      .array(z.enum(['pre_registration', 'first_enrollment', 're_enrollment', 'transfer']))
      .optional(),
    levels: z.array(z.string().max(80)).optional(),
    classIds: z.array(z.string().uuid()).optional(),
    flags: z.array(z.string().max(64)).optional(),
    requireAll: z.boolean().optional(),
  })
  .nullable()
  .optional();

const serializePacket = async (applicationId: string) => {
  const { items, completeness, template, instructionStatus } = await ensureApplicationPacketItems(applicationId);
  const supersededIds = new Set(
    items.map((x) => x.previousItemId).filter((id): id is string => Boolean(id))
  );
  return {
    template: template
      ? {
          id: template.id,
          code: template.code,
          name: template.name,
          applicationKind: template.applicationKind,
          level: template.level,
          campus: template.campus,
          academicYear: template.academicYear,
        }
      : null,
    completeness,
    instructionStatus,
    storageMode: getFileStorageMode(),
    items: items
      .filter((i) => !i.waived && !supersededIds.has(i.id))
      .map((i) => ({
        id: i.id,
        status: i.status,
        fileKey: i.fileKey,
        fileName: i.fileName,
        contentType: i.contentType,
        sizeBytes: i.sizeBytes,
        rejectionReason: i.rejectionReason,
        reviewNotes: i.reviewNotes,
        version: i.version,
        previousItemId: i.previousItemId,
        waived: i.waived,
        reusedFromItemId: i.reusedFromItemId,
        originalSeenAt: i.originalSeenAt,
        issuedAt: i.issuedAt,
        expiresAt: i.expiresAt,
        obligation: i.requirement?.obligation ?? 'optional',
        originalMode: i.requirement?.originalMode ?? 'digital_only',
        helpText: i.requirement?.helpText ?? null,
        depositOpensAt: i.requirement?.depositOpensAt ?? null,
        depositClosesAt: i.requirement?.depositClosesAt ?? null,
        conditionRule: (i.requirement?.conditionRule as ConditionRule | null) ?? null,
        documentType: {
          id: i.documentType.id,
          code: i.documentType.code,
          label: i.documentType.label,
          category: i.documentType.category,
          allowedMime: i.documentType.allowedMime,
          maxSizeBytes: i.documentType.maxSizeBytes,
        },
      })),
  };
};

const notifyPieceEvent = async (
  applicationId: string,
  kind: 'piece_rejected' | 'piece_unreadable' | 'original_requested' | 'piece_expired',
  detail?: string
) => {
  const application = await prisma.strkAdmissionApplication.findUnique({ where: { id: applicationId } });
  if (!application) return;
  await notifyAdmissionContact({
    to: application.contactEmail,
    studentFirstName: application.studentFirstName,
    studentLastName: application.studentLastName,
    publicToken: application.publicToken,
    kind,
    detail,
    phone: pickGuardianPhone(application.guardians),
  }).catch(() => undefined);
};

/** Routes publiques (montées sur admissionsPublicRouter). */
export const registerAdmissionPacketPublicRoutes = (router: Router, submitLimiter: import('express').RequestHandler) => {
  router.get('/status/:token/packet', async (req, res) => {
    const application = await prisma.strkAdmissionApplication.findUnique({
      where: { publicToken: req.params.token },
    });
    if (!application) return res.status(404).json({ error: 'Dossier introuvable' });
    res.json(await serializePacket(application.id));
  });

  router.post('/status/:token/packet/items/:itemId/presign-upload', submitLimiter, async (req, res) => {
    const application = await prisma.strkAdmissionApplication.findUnique({
      where: { publicToken: req.params.token },
    });
    if (!application) return res.status(404).json({ error: 'Dossier introuvable' });
    if (!['draft', 'needs_info'].includes(application.status)) {
      return res.status(409).json({ error: 'Ce dossier ne peut plus recevoir de pièces' });
    }

    const item = await prisma.strkAdmissionDocumentItem.findFirst({
      where: { id: req.params.itemId, applicationId: application.id, waived: false },
      include: { documentType: true, requirement: true },
    });
    if (!item) return res.status(404).json({ error: 'Pièce introuvable' });
    if (item.requirement?.originalMode === 'physical_only') {
      return res.status(409).json({
        error: 'Cette pièce doit être présentée en original sur place',
        code: 'physical_only',
      });
    }

    const parsed = z
      .object({ filename: z.string().min(1).max(255), contentType: z.string().min(1) })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Données invalides' });

    const allowed = item.documentType.allowedMime.length
      ? item.documentType.allowedMime
      : [...ADMISSION_MIME];
    if (!allowed.includes(parsed.data.contentType)) {
      return res.status(400).json({ error: `Type non autorisé pour cette pièce (${allowed.join(', ')})` });
    }

    const scope = `inst-${application.institutionId}-app-${application.id}`;
    const willOptimize = isOptimizableImageMime(parsed.data.contentType);
    const filenameForKey = willOptimize
      ? withWebpExtension(parsed.data.filename)
      : parsed.data.filename;
    const key = buildObjectKey(STORAGE_FOLDER.inscription, scope, filenameForKey);
    const maxSize = item.documentType.maxSizeBytes || MAX_BYTES;
    const uploadPath = `/admissions/status/${req.params.token}/documents/direct-upload`;

    if (willOptimize) {
      return res.json({
        mode: 'local',
        key,
        maxSizeBytes: maxSize,
        uploadPath,
        optimize: 'webp' as const,
      });
    }

    if (isS3Configured()) {
      const { url, fields } = await createPresignedUploadPost(key, parsed.data.contentType, maxSize);
      return res.json({
        mode: 's3',
        key,
        url,
        fields,
        maxSizeBytes: maxSize,
        // Repli navigateur → API (CORS S3 / chiffrement applicatif).
        uploadPath,
      });
    }

    res.json({
      mode: 'local',
      key,
      maxSizeBytes: maxSize,
      uploadPath,
    });
  });

  router.post('/status/:token/packet/items/:itemId/attach', submitLimiter, async (req, res) => {
    const application = await prisma.strkAdmissionApplication.findUnique({
      where: { publicToken: req.params.token },
    });
    if (!application) return res.status(404).json({ error: 'Dossier introuvable' });
    if (!['draft', 'needs_info'].includes(application.status)) {
      return res.status(409).json({ error: 'Ce dossier ne peut plus recevoir de pièces' });
    }

    const item = await prisma.strkAdmissionDocumentItem.findFirst({
      where: { id: req.params.itemId, applicationId: application.id, waived: false },
      include: { documentType: true, requirement: true },
    });
    if (!item) return res.status(404).json({ error: 'Pièce introuvable' });
    if (item.requirement?.originalMode === 'physical_only') {
      return res.status(409).json({ error: 'Cette pièce doit être présentée en original sur place', code: 'physical_only' });
    }

    const parsed = z
      .object({
        fileKey: z.string().min(1),
        fileName: z.string().min(1).max(255).optional(),
        contentType: z.string().optional(),
        sizeBytes: z.number().int().positive().optional(),
        issuedAt: z.string().datetime().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Données invalides' });

    const expectedPrefix = `${STORAGE_FOLDER.inscription}/inst-${application.institutionId}-app-${application.id}/`;
    if (!parsed.data.fileKey.startsWith(expectedPrefix)) {
      return res.status(403).json({ error: 'Ce fichier ne provient pas de ce dossier' });
    }

    try {
      const bytes = await getStoredObjectBytes(parsed.data.fileKey);
      await assertCleanUpload(bytes);
    } catch (error) {
      if (error instanceof AntivirusGateError) {
        if (error.code === 'malware_detected') {
          await deleteStoredObject(parsed.data.fileKey).catch(() => {});
        }
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      throw error;
    }
    // Ré-chiffre un upload navigateur S3 encore en clair (no-op si déjà chiffré / clé absente).
    await ensureStoredObjectEncrypted(parsed.data.fileKey, parsed.data.contentType).catch(() => undefined);

    const nextStatus =
      item.requirement?.originalMode === 'copy_then_original' ? 'original_pending' : 'uploaded';

    const issuedAt = parsed.data.issuedAt ? new Date(parsed.data.issuedAt) : new Date();
    const validityDays = item.documentType.validityDays;
    const expiresAt = validityDays
      ? new Date(issuedAt.getTime() + validityDays * 86400000)
      : null;

    if (item.fileKey && item.status !== 'missing') {
      const archived = await prisma.strkAdmissionDocumentItem.create({
        data: {
          applicationId: application.id,
          documentTypeId: item.documentTypeId,
          // Pas de requirementId : version historique, hors slots actifs du dossier.
          requirementId: null,
          status: item.status,
          fileKey: item.fileKey,
          fileName: item.fileName,
          contentType: item.contentType,
          sizeBytes: item.sizeBytes,
          rejectionReason: item.rejectionReason,
          version: item.version,
          previousItemId: item.previousItemId,
          issuedAt: item.issuedAt,
          expiresAt: item.expiresAt,
          waived: true,
        },
      });
      await prisma.strkAdmissionDocumentItem.update({
        where: { id: item.id },
        data: {
          status: nextStatus,
          fileKey: parsed.data.fileKey,
          fileName: parsed.data.fileName ?? item.fileName,
          contentType: parsed.data.contentType ?? item.contentType,
          sizeBytes: parsed.data.sizeBytes ?? item.sizeBytes,
          rejectionReason: null,
          version: item.version + 1,
          previousItemId: archived.id,
          issuedAt,
          expiresAt,
          reusedFromItemId: null,
        },
      });
    } else {
      await prisma.strkAdmissionDocumentItem.update({
        where: { id: item.id },
        data: {
          status: nextStatus,
          fileKey: parsed.data.fileKey,
          fileName: parsed.data.fileName,
          contentType: parsed.data.contentType,
          sizeBytes: parsed.data.sizeBytes,
          rejectionReason: null,
          issuedAt,
          expiresAt,
        },
      });
    }

    if (nextStatus === 'original_pending') {
      await notifyPieceEvent(application.id, 'original_requested', item.documentType.label);
    }

    const all = await prisma.strkAdmissionDocumentItem.findMany({
      where: { applicationId: application.id, fileKey: { not: null }, waived: false },
      include: { documentType: true },
    });
    await prisma.strkAdmissionApplication.update({
      where: { id: application.id },
      data: {
        documents: all.map((d) => ({
          label: d.documentType.label,
          fileKey: d.fileKey,
          itemId: d.id,
        })),
      },
    });

    res.json(await serializePacket(application.id));
  });

  /** Retire le fichier d’une pièce (brouillon / needs_info) — permet de supprimer puis recharger. */
  router.delete('/status/:token/packet/items/:itemId/file', submitLimiter, async (req, res) => {
    const application = await prisma.strkAdmissionApplication.findUnique({
      where: { publicToken: req.params.token },
    });
    if (!application) return res.status(404).json({ error: 'Dossier introuvable' });
    if (!['draft', 'needs_info'].includes(application.status)) {
      return res.status(409).json({ error: 'Ce dossier ne peut plus modifier ses pièces' });
    }

    const item = await prisma.strkAdmissionDocumentItem.findFirst({
      where: { id: req.params.itemId, applicationId: application.id, waived: false },
      include: { documentType: true, requirement: true },
    });
    if (!item) return res.status(404).json({ error: 'Pièce introuvable' });
    if (!item.fileKey && item.status === 'missing') {
      return res.json(await serializePacket(application.id));
    }

    const oldKey = item.fileKey;
    let archivedId: string | null = null;
    if (oldKey) {
      const archived = await prisma.strkAdmissionDocumentItem.create({
        data: {
          applicationId: application.id,
          documentTypeId: item.documentTypeId,
          requirementId: null,
          status: item.status,
          fileKey: item.fileKey,
          fileName: item.fileName,
          contentType: item.contentType,
          sizeBytes: item.sizeBytes,
          rejectionReason: item.rejectionReason,
          version: item.version,
          previousItemId: item.previousItemId,
          issuedAt: item.issuedAt,
          expiresAt: item.expiresAt,
          waived: true,
        },
      });
      archivedId = archived.id;
    }

    const clearedStatus =
      item.requirement?.originalMode === 'physical_only' ? 'original_pending' : 'missing';

    await prisma.strkAdmissionDocumentItem.update({
      where: { id: item.id },
      data: {
        status: clearedStatus,
        fileKey: null,
        fileName: null,
        contentType: null,
        sizeBytes: null,
        rejectionReason: null,
        reviewNotes: null,
        reviewedBy: null,
        reviewedAt: null,
        originalSeenAt: null,
        issuedAt: null,
        expiresAt: null,
        reusedFromItemId: null,
        version: oldKey ? item.version + 1 : item.version,
        previousItemId: archivedId,
      },
    });

    // Best-effort : ne pas bloquer si le stockage local/S3 échoue.
    if (oldKey) {
      await deleteStoredObject(oldKey).catch(() => {});
    }

    const all = await prisma.strkAdmissionDocumentItem.findMany({
      where: { applicationId: application.id, fileKey: { not: null }, waived: false },
      include: { documentType: true },
    });
    await prisma.strkAdmissionApplication.update({
      where: { id: application.id },
      data: {
        documents: all.map((d) => ({
          label: d.documentType.label,
          fileKey: d.fileKey,
          itemId: d.id,
        })),
      },
    });

    await logAudit({
      institutionId: application.institutionId,
      action: 'admission.document_cleared',
      targetType: 'admission_document_item',
      targetId: item.id,
      metadata: { applicationId: application.id, documentTypeId: item.documentTypeId },
      ipAddress: req.ip,
    });

    res.json(await serializePacket(application.id));
  });
};

/** Routes staff (montées sur admissionsRouter, après auth). */
export const registerAdmissionPacketStaffRoutes = (router: Router) => {
  const staff = [requireAuth, requireRole(...SECRETARIAT_ROLES), requireFeature('admissions')] as const;

  router.post('/packets/ensure', ...staff, async (req, res) => {
    const institutionId = req.auth!.institutionId;
    if (!institutionId) return res.status(400).json({ error: 'Établissement requis' });
    await ensureInstitutionAdmissionPackets(institutionId);
    const types = await prisma.strkAdmissionDocumentType.findMany({
      where: { institutionId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    const templates = await prisma.strkAdmissionPacketTemplate.findMany({
      where: { institutionId, isActive: true },
      include: { requirements: { include: { documentType: true }, orderBy: { sortOrder: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    res.json({ types, templates });
  });

  router.get('/packets/catalog', ...staff, async (req, res) => {
    await ensurePlatformCatalog();
    const institutionId = req.auth!.institutionId;
    if (!institutionId) return res.status(400).json({ error: 'Établissement requis' });
    await ensureInstitutionAdmissionPackets(institutionId);
    const types = await prisma.strkAdmissionDocumentType.findMany({
      where: { OR: [{ institutionId: null }, { institutionId }], isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ types });
  });

  // --- CRUD types locaux ---
  router.post('/packets/types', ...staff, async (req, res) => {
    const institutionId = req.auth!.institutionId;
    if (!institutionId) return res.status(400).json({ error: 'Établissement requis' });
    const parsed = z
      .object({
        code: z.string().min(1).max(64).regex(/^[a-z0-9_]+$/),
        label: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
        category: z.string().min(1).max(64),
        allowedMime: z.array(z.string()).optional(),
        maxSizeBytes: z.number().int().positive().max(50 * 1024 * 1024).optional(),
        maxFiles: z.number().int().positive().max(10).optional(),
        validityDays: z.number().int().positive().nullable().optional(),
        sortOrder: z.number().int().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });

    const created = await prisma.strkAdmissionDocumentType.create({
      data: {
        institutionId,
        code: parsed.data.code,
        label: parsed.data.label,
        description: parsed.data.description,
        category: parsed.data.category,
        allowedMime: parsed.data.allowedMime,
        maxSizeBytes: parsed.data.maxSizeBytes,
        maxFiles: parsed.data.maxFiles,
        validityDays: parsed.data.validityDays,
        sortOrder: parsed.data.sortOrder ?? 0,
      },
    });
    await logAudit({
      institutionId,
      actorId: req.auth!.sub,
      action: 'admission.document_type_created',
      targetType: 'admission_document_type',
      targetId: created.id,
    });
    res.status(201).json({ type: created });
  });

  router.patch('/packets/types/:typeId', ...staff, async (req, res) => {
    const institutionId = req.auth!.institutionId;
    if (!institutionId) return res.status(400).json({ error: 'Établissement requis' });
    const existing = await prisma.strkAdmissionDocumentType.findFirst({
      where: { id: req.params.typeId, institutionId },
    });
    if (!existing) return res.status(404).json({ error: 'Type introuvable' });

    const parsed = z
      .object({
        label: z.string().min(1).max(200).optional(),
        description: z.string().max(1000).nullable().optional(),
        category: z.string().min(1).max(64).optional(),
        allowedMime: z.array(z.string()).optional(),
        maxSizeBytes: z.number().int().positive().max(50 * 1024 * 1024).optional(),
        maxFiles: z.number().int().positive().max(10).optional(),
        validityDays: z.number().int().positive().nullable().optional(),
        sortOrder: z.number().int().optional(),
        isActive: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Données invalides' });

    const updated = await prisma.strkAdmissionDocumentType.update({
      where: { id: existing.id },
      data: parsed.data,
    });
    res.json({ type: updated });
  });

  // --- CRUD modèles ---
  router.get('/packets/templates', ...staff, async (req, res) => {
    const institutionId = req.auth!.institutionId;
    if (!institutionId) return res.status(400).json({ error: 'Établissement requis' });
    await ensureInstitutionAdmissionPackets(institutionId);
    const templates = await prisma.strkAdmissionPacketTemplate.findMany({
      where: { institutionId },
      include: { requirements: { include: { documentType: true }, orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ applicationKind: 'asc' }, { name: 'asc' }],
    });
    res.json({ templates });
  });

  router.post('/packets/templates', ...staff, async (req, res) => {
    const institutionId = req.auth!.institutionId;
    if (!institutionId) return res.status(400).json({ error: 'Établissement requis' });
    const parsed = z
      .object({
        code: z.string().min(1).max(64).regex(/^[a-z0-9_]+$/),
        name: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
        applicationKind: z.enum(['pre_registration', 'first_enrollment', 're_enrollment', 'transfer']),
        level: z.string().max(80).nullable().optional(),
        classId: z.string().uuid().nullable().optional(),
        academicYear: z.string().max(32).nullable().optional(),
        isDefault: z.boolean().optional(),
        requirements: z
          .array(
            z.object({
              documentTypeId: z.string().uuid(),
              obligation: z.enum(['required', 'optional', 'conditional']),
              originalMode: z.enum(['digital_only', 'copy_then_original', 'physical_only']).optional(),
              helpText: z.string().max(500).nullable().optional(),
              conditionRule: conditionRuleSchema,
              depositOpensAt: z.string().datetime().nullable().optional(),
              depositClosesAt: z.string().datetime().nullable().optional(),
              sortOrder: z.number().int().optional(),
            })
          )
          .optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });

    if (parsed.data.classId) {
      const klass = await prisma.strkClass.findUnique({ where: { id: parsed.data.classId } });
      if (!klass || klass.institutionId !== institutionId) {
        return res.status(400).json({ error: 'Classe invalide' });
      }
    }

    const template = await prisma.strkAdmissionPacketTemplate.create({
      data: {
        institutionId,
        code: parsed.data.code,
        name: parsed.data.name,
        description: parsed.data.description,
        applicationKind: parsed.data.applicationKind,
        level: parsed.data.level ?? null,
        classId: parsed.data.classId ?? null,
        academicYear: parsed.data.academicYear ?? null,
        isDefault: parsed.data.isDefault ?? false,
        requirements: parsed.data.requirements
          ? {
              create: parsed.data.requirements.map((r, i) => ({
                documentTypeId: r.documentTypeId,
                obligation: r.obligation,
                originalMode: r.originalMode ?? 'digital_only',
                helpText: r.helpText ?? null,
                conditionRule: r.conditionRule ?? undefined,
                sortOrder: r.sortOrder ?? (i + 1) * 10,
              })),
            }
          : undefined,
      },
      include: { requirements: { include: { documentType: true }, orderBy: { sortOrder: 'asc' } } },
    });

    await logAudit({
      institutionId,
      actorId: req.auth!.sub,
      action: 'admission.packet_template_created',
      targetType: 'admission_packet_template',
      targetId: template.id,
    });
    res.status(201).json({ template });
  });

  router.patch('/packets/templates/:templateId', ...staff, async (req, res) => {
    const institutionId = req.auth!.institutionId;
    if (!institutionId) return res.status(400).json({ error: 'Établissement requis' });
    const existing = await prisma.strkAdmissionPacketTemplate.findFirst({
      where: { id: req.params.templateId, institutionId },
    });
    if (!existing) return res.status(404).json({ error: 'Modèle introuvable' });

    const parsed = z
      .object({
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(1000).nullable().optional(),
        level: z.string().max(80).nullable().optional(),
        classId: z.string().uuid().nullable().optional(),
        academicYear: z.string().max(32).nullable().optional(),
        isDefault: z.boolean().optional(),
        isActive: z.boolean().optional(),
        applicationKind: z
          .enum(['pre_registration', 'first_enrollment', 're_enrollment', 'transfer'])
          .optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Données invalides' });

    const updated = await prisma.strkAdmissionPacketTemplate.update({
      where: { id: existing.id },
      data: parsed.data,
      include: { requirements: { include: { documentType: true }, orderBy: { sortOrder: 'asc' } } },
    });
    res.json({ template: updated });
  });

  router.put('/packets/templates/:templateId/requirements', ...staff, async (req, res) => {
    const institutionId = req.auth!.institutionId;
    if (!institutionId) return res.status(400).json({ error: 'Établissement requis' });
    const existing = await prisma.strkAdmissionPacketTemplate.findFirst({
      where: { id: req.params.templateId, institutionId },
    });
    if (!existing) return res.status(404).json({ error: 'Modèle introuvable' });

    const parsed = z
      .object({
        requirements: z.array(
          z.object({
            documentTypeId: z.string().uuid(),
            obligation: z.enum(['required', 'optional', 'conditional']),
            originalMode: z.enum(['digital_only', 'copy_then_original', 'physical_only']).optional(),
            helpText: z.string().max(500).nullable().optional(),
            conditionRule: conditionRuleSchema,
            depositOpensAt: z.string().datetime().nullable().optional(),
            depositClosesAt: z.string().datetime().nullable().optional(),
            sortOrder: z.number().int().optional(),
          })
        ),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Données invalides' });

    await prisma.$transaction(async (tx) => {
      await tx.strkAdmissionPacketRequirement.deleteMany({ where: { templateId: existing.id } });
      for (let i = 0; i < parsed.data.requirements.length; i++) {
        const r = parsed.data.requirements[i]!;
        await tx.strkAdmissionPacketRequirement.create({
          data: {
            templateId: existing.id,
            documentTypeId: r.documentTypeId,
            obligation: r.obligation,
            originalMode: r.originalMode ?? 'digital_only',
            helpText: r.helpText ?? null,
            conditionRule: r.conditionRule ?? undefined,
            depositOpensAt: r.depositOpensAt ? new Date(r.depositOpensAt) : null,
            depositClosesAt: r.depositClosesAt ? new Date(r.depositClosesAt) : null,
            sortOrder: r.sortOrder ?? (i + 1) * 10,
          },
        });
      }
    });

    const template = await prisma.strkAdmissionPacketTemplate.findUnique({
      where: { id: existing.id },
      include: { requirements: { include: { documentType: true }, orderBy: { sortOrder: 'asc' } } },
    });
    await logAudit({
      institutionId,
      actorId: req.auth!.sub,
      action: 'admission.packet_template_requirements_updated',
      targetType: 'admission_packet_template',
      targetId: existing.id,
    });
    res.json({ template });
  });

  router.post('/packets/templates/:templateId/duplicate', ...staff, async (req, res) => {
    const institutionId = req.auth!.institutionId;
    if (!institutionId) return res.status(400).json({ error: 'Établissement requis' });
    const source = await prisma.strkAdmissionPacketTemplate.findFirst({
      where: { id: req.params.templateId, institutionId },
      include: { requirements: true },
    });
    if (!source) return res.status(404).json({ error: 'Modèle introuvable' });

    const parsed = z
      .object({
        code: z.string().min(1).max(64).regex(/^[a-z0-9_]+$/),
        name: z.string().min(1).max(200),
        academicYear: z.string().max(32).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Données invalides' });

    const template = await prisma.strkAdmissionPacketTemplate.create({
      data: {
        institutionId,
        code: parsed.data.code,
        name: parsed.data.name,
        description: source.description,
        applicationKind: source.applicationKind,
        level: source.level,
        classId: source.classId,
        academicYear: parsed.data.academicYear ?? source.academicYear,
        isDefault: false,
        isActive: true,
        requirements: {
          create: source.requirements.map((r) => ({
            documentTypeId: r.documentTypeId,
            obligation: r.obligation,
            originalMode: r.originalMode,
            helpText: r.helpText,
            conditionRule: r.conditionRule ?? undefined,
            depositOpensAt: r.depositOpensAt,
            depositClosesAt: r.depositClosesAt,
            sortOrder: r.sortOrder,
          })),
        },
      },
      include: { requirements: { include: { documentType: true }, orderBy: { sortOrder: 'asc' } } },
    });
    res.status(201).json({ template });
  });

  // File agents filtrée (§8)
  router.get('/packets/review-queue', ...staff, async (req, res) => {
    const institutionId = req.auth!.institutionId;
    if (!institutionId) return res.status(400).json({ error: 'Établissement requis' });

    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const academicYear = typeof req.query.academicYear === 'string' ? req.query.academicYear : undefined;
    const level = typeof req.query.level === 'string' ? req.query.level : undefined;
    const applicationKind = typeof req.query.applicationKind === 'string' ? req.query.applicationKind : undefined;
    const pieceStatus = typeof req.query.pieceStatus === 'string' ? req.query.pieceStatus : undefined;
    const submittedFrom = typeof req.query.submittedFrom === 'string' ? new Date(req.query.submittedFrom) : undefined;
    const submittedTo = typeof req.query.submittedTo === 'string' ? new Date(req.query.submittedTo) : undefined;

    const applications = await prisma.strkAdmissionApplication.findMany({
      where: {
        institutionId,
        ...(status ? { status: status as never } : { status: { in: ['submitted', 'needs_info', 'conditionally_accepted'] } }),
        ...(academicYear ? { academicYear } : {}),
        ...(level ? { level } : {}),
        ...(applicationKind ? { applicationKind: applicationKind as never } : {}),
        ...(submittedFrom || submittedTo
          ? {
              submittedAt: {
                ...(submittedFrom && !Number.isNaN(submittedFrom.getTime()) ? { gte: submittedFrom } : {}),
                ...(submittedTo && !Number.isNaN(submittedTo.getTime()) ? { lte: submittedTo } : {}),
              },
            }
          : {}),
        ...(pieceStatus
          ? {
              documentItems: {
                some: { status: pieceStatus as never, waived: false },
              },
            }
          : {}),
      },
      include: {
        documentItems: {
          where: { waived: false },
          include: { documentType: true, requirement: true },
        },
        class: { select: { id: true, name: true } },
      },
      orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    });

    res.json({
      applications: applications.map((a) => ({
        id: a.id,
        status: a.status,
        academicYear: a.academicYear,
        level: a.level,
        applicationKind: a.applicationKind,
        studentFirstName: a.studentFirstName,
        studentLastName: a.studentLastName,
        contactEmail: a.contactEmail,
        submittedAt: a.submittedAt,
        class: a.class,
        piecesSummary: {
          total: a.documentItems.length,
          pendingReview: a.documentItems.filter((i) =>
            ['uploaded', 'in_review', 'original_pending'].includes(i.status)
          ).length,
          nonCompliant: a.documentItems.filter((i) =>
            ['non_compliant', 'unreadable', 'expired'].includes(i.status)
          ).length,
        },
      })),
    });
  });

  router.post('/:id/packet/reuse', ...staff, async (req, res) => {
    const application = await prisma.strkAdmissionApplication.findUnique({ where: { id: req.params.id } });
    if (!application) return res.status(404).json({ error: 'Dossier introuvable' });
    if (!isSameInstitution(req.auth!, application.institutionId)) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const result = await reuseValidDocumentsFromPrevious(application.id);
    await logAudit({
      institutionId: application.institutionId,
      actorId: req.auth!.sub,
      action: 'admission.documents_reused',
      targetType: 'admission_application',
      targetId: application.id,
      metadata: result,
    });
    res.json({ ...result, packet: await serializePacket(application.id) });
  });

  router.get('/:id/packet', ...staff, async (req, res) => {
    const application = await prisma.strkAdmissionApplication.findUnique({ where: { id: req.params.id } });
    if (!application) return res.status(404).json({ error: 'Dossier introuvable' });
    if (!isSameInstitution(req.auth!, application.institutionId)) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    res.json(await serializePacket(application.id));
  });

  const reviewSchema = z.object({
    status: z.enum(['compliant', 'non_compliant', 'unreadable', 'original_pending', 'finalized', 'in_review']),
    rejectionReason: z.string().max(500).optional(),
    reviewNotes: z.string().max(1000).optional(),
    originalSeen: z.boolean().optional(),
  });

  router.patch('/:id/packet/items/:itemId', ...staff, async (req, res) => {
    const application = await prisma.strkAdmissionApplication.findUnique({ where: { id: req.params.id } });
    if (!application) return res.status(404).json({ error: 'Dossier introuvable' });
    if (!isSameInstitution(req.auth!, application.institutionId)) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const item = await prisma.strkAdmissionDocumentItem.findFirst({
      where: { id: req.params.itemId, applicationId: application.id },
      include: { documentType: true },
    });
    if (!item) return res.status(404).json({ error: 'Pièce introuvable' });

    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Données invalides' });

    if (parsed.data.originalSeen) {
      await markOriginalSeen({
        applicationId: application.id,
        itemId: item.id,
        actorId: req.auth!.sub,
        finalize: parsed.data.status === 'finalized',
      });
      if (parsed.data.status !== 'finalized' && parsed.data.status !== 'compliant') {
        await prisma.strkAdmissionDocumentItem.update({
          where: { id: item.id },
          data: {
            status: parsed.data.status,
            rejectionReason: parsed.data.rejectionReason ?? null,
            reviewNotes: parsed.data.reviewNotes ?? null,
            reviewedBy: req.auth!.sub,
            reviewedAt: new Date(),
          },
        });
      }
    } else {
      await prisma.strkAdmissionDocumentItem.update({
        where: { id: item.id },
        data: {
          status: parsed.data.status,
          rejectionReason: parsed.data.rejectionReason ?? null,
          reviewNotes: parsed.data.reviewNotes ?? null,
          reviewedBy: req.auth!.sub,
          reviewedAt: new Date(),
        },
      });
    }

    await logAudit({
      institutionId: application.institutionId,
      actorId: req.auth!.sub,
      action: 'admission.document_reviewed',
      targetType: 'admission_document_item',
      targetId: item.id,
      metadata: {
        status: parsed.data.status,
        applicationId: application.id,
        originalSeen: !!parsed.data.originalSeen,
      },
    });

    if (parsed.data.status === 'non_compliant') {
      await notifyPieceEvent(application.id, 'piece_rejected', item.documentType.label);
    } else if (parsed.data.status === 'unreadable') {
      await notifyPieceEvent(application.id, 'piece_unreadable', item.documentType.label);
    } else if (parsed.data.status === 'original_pending') {
      await notifyPieceEvent(application.id, 'original_requested', item.documentType.label);
    }

    res.json(await serializePacket(application.id));
  });

  // Politique canaux + paiement
  router.get('/packets/policy', ...staff, async (req, res) => {
    const institutionId = req.auth!.institutionId;
    if (!institutionId) return res.status(400).json({ error: 'Établissement requis' });
    res.json({ policy: await getAdmissionInstitutionPolicy(institutionId) });
  });

  router.put('/packets/policy', ...staff, async (req, res) => {
    const institutionId = req.auth!.institutionId;
    if (!institutionId) return res.status(400).json({ error: 'Établissement requis' });
    const parsed = z
      .object({
        channels: z
          .object({
            email: z.boolean().optional(),
            sms: z.boolean().optional(),
            whatsapp: z.boolean().optional(),
            inApp: z.boolean().optional(),
          })
          .optional(),
        payment: z
          .object({
            trigger: z
              .enum(['before_review', 'after_acceptance', 'reservation_deposit', 'full_before_confirm', 'manual'])
              .optional(),
            requirePaidBeforeSubmit: z.boolean().optional(),
            requirePaidBeforeEnroll: z.boolean().optional(),
          })
          .optional(),
        expiryReminderDays: z.number().int().positive().max(365).optional(),
        deadlineReminderDays: z.number().int().positive().max(90).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Données invalides' });
    const policy = await setAdmissionInstitutionPolicy(institutionId, parsed.data);
    await logAudit({
      institutionId,
      actorId: req.auth!.sub,
      action: 'admission.policy_updated',
      targetType: 'institution',
      targetId: institutionId,
    });
    res.json({ policy });
  });

  // Motifs standard
  router.get('/packets/rejection-reasons', ...staff, async (req, res) => {
    const institutionId = req.auth!.institutionId;
    if (!institutionId) return res.status(400).json({ error: 'Établissement requis' });
    await ensureDefaultRejectionReasons(institutionId);
    const reasons = await prisma.strkAdmissionRejectionReason.findMany({
      where: { institutionId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ reasons });
  });

  router.post('/packets/rejection-reasons', ...staff, async (req, res) => {
    const institutionId = req.auth!.institutionId;
    if (!institutionId) return res.status(400).json({ error: 'Établissement requis' });
    const parsed = z
      .object({
        code: z.string().min(1).max(64).regex(/^[a-z0-9_]+$/),
        label: z.string().min(1).max(200),
        sortOrder: z.number().int().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Données invalides' });
    const reason = await prisma.strkAdmissionRejectionReason.create({
      data: {
        institutionId,
        code: parsed.data.code,
        label: parsed.data.label,
        sortOrder: parsed.data.sortOrder ?? 100,
      },
    });
    res.status(201).json({ reason });
  });

  // Téléchargement signé + audit
  router.get('/:id/packet/items/:itemId/download', ...staff, async (req, res) => {
    const application = await prisma.strkAdmissionApplication.findUnique({ where: { id: req.params.id } });
    if (!application) return res.status(404).json({ error: 'Dossier introuvable' });
    if (!isSameInstitution(req.auth!, application.institutionId)) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const item = await prisma.strkAdmissionDocumentItem.findFirst({
      where: { id: req.params.itemId, applicationId: application.id },
    });
    if (!item?.fileKey) return res.status(404).json({ error: 'Fichier introuvable' });

    await logAudit({
      institutionId: application.institutionId,
      actorId: req.auth!.sub,
      action: 'admission.document_downloaded',
      targetType: 'admission_document_item',
      targetId: item.id,
      metadata: { applicationId: application.id, fileKey: item.fileKey },
      ipAddress: req.ip,
    });

    // Avec chiffrement applicatif, toujours servir via l'API (déchiffrement).
    // Sans chiffrement + S3 : URL signée possible.
    const { isAtRestEncryptionEnabled, getStoredObjectBytes } = await import('../lib/fileStorage.js');
    if (isS3Configured() && !isAtRestEncryptionEnabled()) {
      try {
        const url = await getPresignedDownloadUrl(item.fileKey, 300);
        return res.json({ mode: 's3', url, fileName: item.fileName, contentType: item.contentType });
      } catch (err) {
        console.error('Presign admission piece failed:', err);
        return res.status(502).json({ error: 'Impossible de générer le lien de téléchargement' });
      }
    }

    try {
      const bytes = await getStoredObjectBytes(item.fileKey);
      res.setHeader('Content-Type', item.contentType || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${(item.fileName || 'piece').replace(/"/g, '')}"`
      );
      res.send(Buffer.from(bytes));
    } catch (err) {
      console.error('Lecture pièce admission échouée:', err);
      return res.status(404).json({ error: 'Fichier introuvable sur le stockage' });
    }
  });

  // Historique des versions
  router.get('/:id/packet/items/:itemId/versions', ...staff, async (req, res) => {
    const application = await prisma.strkAdmissionApplication.findUnique({ where: { id: req.params.id } });
    if (!application) return res.status(404).json({ error: 'Dossier introuvable' });
    if (!isSameInstitution(req.auth!, application.institutionId)) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const item = await prisma.strkAdmissionDocumentItem.findFirst({
      where: { id: req.params.itemId, applicationId: application.id },
    });
    if (!item) return res.status(404).json({ error: 'Pièce introuvable' });

    const versions: Array<{
      id: string;
      version: number;
      status: string;
      fileName: string | null;
      reviewedAt: Date | null;
      createdAt: Date;
      isCurrent: boolean;
    }> = [];
    let cursor: string | null = item.id;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const row: {
        id: string;
        version: number;
        status: string;
        fileName: string | null;
        reviewedAt: Date | null;
        createdAt: Date;
        previousItemId: string | null;
      } | null = await prisma.strkAdmissionDocumentItem.findUnique({
        where: { id: cursor },
        select: {
          id: true,
          version: true,
          status: true,
          fileName: true,
          reviewedAt: true,
          createdAt: true,
          previousItemId: true,
        },
      });
      if (!row) break;
      versions.push({
        id: row.id,
        version: row.version,
        status: row.status,
        fileName: row.fileName,
        reviewedAt: row.reviewedAt,
        createdAt: row.createdAt,
        isCurrent: row.id === item.id,
      });
      cursor = row.previousItemId;
    }
    res.json({ versions });
  });
};
