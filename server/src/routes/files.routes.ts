import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  isS3Configured,
  buildObjectKey,
  buildTenantScope,
  isOwnedObjectKey,
  createPresignedUploadPost,
  getPresignedDownloadUrl,
} from '../lib/s3.js';
import { isGlobalAdmin } from '../lib/authz.js';
import { checkQuota, QUOTA_LABELS } from '../lib/quotas.js';
import { runFilePurge } from '../lib/filePurge.js';
import { STORAGE_FOLDERS, UPLOAD_FOLDERS, type StorageFolder, type UploadFolder } from '../lib/storageFolders.js';

export const filesRouter = Router();
filesRouter.use(requireAuth);

const requireS3Configured: import('express').RequestHandler = (_req, res, next) => {
  if (!isS3Configured()) {
    return res.status(501).json({
      error: "Le stockage de fichiers n'est pas configuré sur cette instance (variables S3_* manquantes). Contactez SDCREATIV.",
    });
  }
  next();
};

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const PDF_IMAGE = [...IMAGE_TYPES, 'application/pdf'] as const;
const DOC_LIKE = [
  ...IMAGE_TYPES,
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

/** Règles MIME pour uploads navigateur uniquement. */
const UPLOAD_FOLDER_RULES: Record<UploadFolder, { types: readonly string[]; maxSizeBytes: number }> = {
  avatars: { types: IMAGE_TYPES, maxSizeBytes: 5 * 1024 * 1024 },
  documents: { types: PDF_IMAGE, maxSizeBytes: 10 * 1024 * 1024 },
  devoirs: { types: DOC_LIKE, maxSizeBytes: 20 * 1024 * 1024 },
  exercices: { types: DOC_LIKE, maxSizeBytes: 20 * 1024 * 1024 },
  messages: { types: PDF_IMAGE, maxSizeBytes: 10 * 1024 * 1024 },
  recus: { types: PDF_IMAGE, maxSizeBytes: 10 * 1024 * 1024 },
  cours: { types: DOC_LIKE, maxSizeBytes: 20 * 1024 * 1024 },
  inscription: { types: PDF_IMAGE, maxSizeBytes: 10 * 1024 * 1024 },
  justificatifs: { types: PDF_IMAGE, maxSizeBytes: 5 * 1024 * 1024 },
};

const presignUploadSchema = z.object({
  folder: z.enum(UPLOAD_FOLDERS),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1),
});

filesRouter.post('/presign-upload', async (req, res) => {
  const parsed = presignUploadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const rules = UPLOAD_FOLDER_RULES[parsed.data.folder];
  if (!rules.types.includes(parsed.data.contentType)) {
    return res.status(400).json({ error: `Type de fichier non autorisé pour ce dossier (autorisés : ${rules.types.join(', ')})` });
  }
  if (!isS3Configured()) {
    return res.status(501).json({
      error: "Le stockage de fichiers n'est pas configuré sur cette instance (variables S3_* manquantes). Contactez SDCREATIV.",
    });
  }
  if (req.auth!.institutionId) {
    const storageQuota = await checkQuota(req.auth!.institutionId, 'storageGb', 0);
    if (!storageQuota.allowed) {
      return res.status(403).json({
        error: `Quota de ${QUOTA_LABELS.storageGb} atteint (${storageQuota.current}/${storageQuota.limit} Go).`,
        quota: storageQuota,
      });
    }
  }
  const tenantScope = buildTenantScope(req.auth!.institutionId, req.auth!.sub);
  const key = buildObjectKey(parsed.data.folder, tenantScope, parsed.data.filename);
  const { url, fields } = await createPresignedUploadPost(key, parsed.data.contentType, rules.maxSizeBytes);
  res.json({ key, url, fields, maxSizeBytes: rules.maxSizeBytes, expiresIn: 300 });
});

const presignDownloadSchema = z.object({ key: z.string().min(1) });

filesRouter.post('/presign-download', requireS3Configured, async (req, res) => {
  const parsed = presignDownloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const folder = (STORAGE_FOLDERS as readonly string[]).find((f) =>
    parsed.data.key.startsWith(`${f}/`)
  ) as StorageFolder | undefined;
  if (!folder || folder === 'backups') {
    return res.status(400).json({ error: 'Clé de fichier invalide' });
  }
  // Inscription : scope `inst-{id}-app-{id}` — téléchargement via module admissions.
  if (folder === 'inscription') {
    return res.status(403).json({ error: 'Téléchargement via le module inscription uniquement' });
  }
  if (!isGlobalAdmin(req.auth!) && !isOwnedObjectKey(parsed.data.key, folder, req.auth!.institutionId, req.auth!.sub)) {
    return res.status(403).json({ error: 'Accès refusé à ce fichier' });
  }
  const downloadUrl = await getPresignedDownloadUrl(parsed.data.key);
  res.json({ downloadUrl, expiresIn: 3600 });
});

const purgeSchema = z.object({ dryRun: z.boolean().optional() });

filesRouter.post('/purge', requireRole('admin'), async (req, res) => {
  const parsed = purgeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const result = await runFilePurge({ dryRun: parsed.data.dryRun });
  res.json(result);
});
