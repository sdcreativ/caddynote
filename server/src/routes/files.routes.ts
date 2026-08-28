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
import { putStoredObject, getFileStorageMode, getStoredObjectBytes, isAtRestEncryptionEnabled } from '../lib/fileStorage.js';
import { STORAGE_FOLDERS, UPLOAD_FOLDERS, type StorageFolder, type UploadFolder } from '../lib/storageFolders.js';
import {
  ImageOptimizeError,
  isOptimizableImageMime,
  maxEdgeForFolder,
  maybeOptimizeUploadedImage,
  withWebpExtension,
} from '../lib/imageOptimize.js';

export const filesRouter = Router();
filesRouter.use(requireAuth);

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
    return res.status(400).json({
      error: `Type de fichier non autorisé pour ce dossier (autorisés : ${rules.types.join(', ')})`,
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
  const willOptimize = isOptimizableImageMime(parsed.data.contentType);
  const filenameForKey = willOptimize
    ? withWebpExtension(parsed.data.filename)
    : parsed.data.filename;
  const key = buildObjectKey(parsed.data.folder, tenantScope, filenameForKey);
  const uploadPath = '/files/direct-upload';

  // Images : toujours via l’API (conversion WebP) — pas de POST S3 navigateur.
  if (willOptimize) {
    return res.json({
      mode: 'local' as const,
      key,
      uploadPath,
      maxSizeBytes: rules.maxSizeBytes,
      storageMode: getFileStorageMode(),
      optimize: 'webp' as const,
    });
  }

  // S3 direct navigateur + repli API (CORS / instance sans bucket).
  if (isS3Configured()) {
    const { url, fields } = await createPresignedUploadPost(
      key,
      parsed.data.contentType,
      rules.maxSizeBytes
    );
    return res.json({
      mode: 's3' as const,
      key,
      url,
      fields,
      uploadPath,
      maxSizeBytes: rules.maxSizeBytes,
      expiresIn: 300,
      storageMode: getFileStorageMode(),
    });
  }

  res.json({
    mode: 'local' as const,
    key,
    uploadPath,
    maxSizeBytes: rules.maxSizeBytes,
    storageMode: getFileStorageMode(),
  });
});

/**
 * Upload binaire via l’API (local ou S3 serveur). Évite les échecs CORS du
 * POST navigateur → S3, et sert de repli sans bucket.
 */
filesRouter.put('/direct-upload', async (req, res) => {
  const keyHeader = typeof req.headers['x-object-key'] === 'string' ? req.headers['x-object-key'] : '';
  const folder = (UPLOAD_FOLDERS as readonly string[]).find((f) =>
    keyHeader.startsWith(`${f}/`)
  ) as UploadFolder | undefined;
  if (!folder) {
    return res.status(400).json({ error: 'Clé de fichier invalide' });
  }
  if (
    !isGlobalAdmin(req.auth!) &&
    !isOwnedObjectKey(keyHeader, folder, req.auth!.institutionId, req.auth!.sub) &&
    !isOwnedObjectKey(keyHeader, folder, null, req.auth!.sub)
  ) {
    return res.status(403).json({ error: 'Accès refusé à cette clé de fichier' });
  }

  const rules = UPLOAD_FOLDER_RULES[folder];
  const contentType = (req.headers['content-type'] || '').split(';')[0].trim();
  if (!rules.types.includes(contentType)) {
    return res.status(400).json({
      error: `Type de fichier non autorisé pour ce dossier (autorisés : ${rules.types.join(', ')})`,
    });
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > rules.maxSizeBytes) {
      return res.status(413).json({
        error: `Fichier trop volumineux (max ${Math.round(rules.maxSizeBytes / (1024 * 1024))} Mo)`,
      });
    }
    chunks.push(buf);
  }
  const body = Buffer.concat(chunks);
  if (body.length === 0) {
    return res.status(400).json({ error: 'Fichier vide' });
  }

  try {
    const result = await maybeOptimizeUploadedImage(body, contentType, keyHeader, {
      maxEdgePx: maxEdgeForFolder(folder),
    });
    if (result.optimized) {
      if (
        !isGlobalAdmin(req.auth!) &&
        !isOwnedObjectKey(result.key, folder, req.auth!.institutionId, req.auth!.sub) &&
        !isOwnedObjectKey(result.key, folder, null, req.auth!.sub)
      ) {
        return res.status(403).json({ error: 'Accès refusé à cette clé de fichier' });
      }
    }
    await putStoredObject(result.key, result.body, result.contentType);
    return res.status(201).json({
      key: result.key,
      bytes: result.body.length,
      mode: getFileStorageMode(),
      contentType: result.contentType,
      optimized: result.optimized,
    });
  } catch (err) {
    if (err instanceof ImageOptimizeError) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
});

const contentTypeForObjectKey = (key: string): string => {
  const lower = key.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return 'application/octet-stream';
};

const assertCanAccessObjectKey = (
  auth: NonNullable<import('express').Request['auth']>,
  key: string,
  folder: StorageFolder
): boolean =>
  isGlobalAdmin(auth) ||
  isOwnedObjectKey(key, folder, auth.institutionId, auth.sub) ||
  isOwnedObjectKey(key, folder, null, auth.sub);

const presignDownloadSchema = z.object({ key: z.string().min(1) });

/**
 * Métadonnées de téléchargement.
 * - S3 sans chiffrement applicatif → URL signée
 * - Local ou chiffrement → chemin authentifié `/files/content` (déchiffrement)
 */
filesRouter.post('/presign-download', async (req, res) => {
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
  if (folder === 'inscription') {
    return res.status(403).json({ error: 'Téléchargement via le module inscription uniquement' });
  }
  if (!assertCanAccessObjectKey(req.auth!, parsed.data.key, folder)) {
    return res.status(403).json({ error: 'Accès refusé à ce fichier' });
  }

  const downloadPath = `/files/content?key=${encodeURIComponent(parsed.data.key)}`;

  if (isS3Configured() && !isAtRestEncryptionEnabled()) {
    try {
      const downloadUrl = await getPresignedDownloadUrl(parsed.data.key);
      return res.json({ mode: 's3', downloadUrl, downloadPath, expiresIn: 3600 });
    } catch (err) {
      console.error('Presign download S3 :', err);
    }
  }

  res.json({
    mode: 'local',
    downloadPath,
    storageMode: getFileStorageMode(),
  });
});

/** Contenu binaire authentifié (local + S3 chiffré / secours). */
filesRouter.get('/content', async (req, res) => {
  const key = typeof req.query.key === 'string' ? req.query.key : '';
  if (!key) {
    return res.status(400).json({ error: 'Paramètre key requis' });
  }
  const folder = (STORAGE_FOLDERS as readonly string[]).find((f) =>
    key.startsWith(`${f}/`)
  ) as StorageFolder | undefined;
  if (!folder || folder === 'backups') {
    return res.status(400).json({ error: 'Clé de fichier invalide' });
  }
  if (folder === 'inscription') {
    return res.status(403).json({ error: 'Téléchargement via le module inscription uniquement' });
  }
  if (!assertCanAccessObjectKey(req.auth!, key, folder)) {
    return res.status(403).json({ error: 'Accès refusé à ce fichier' });
  }

  try {
    const bytes = await getStoredObjectBytes(key);
    const filename = key.split('/').pop() || 'fichier';
    res.setHeader('Content-Type', contentTypeForObjectKey(key));
    res.setHeader('Content-Disposition', `inline; filename="${filename.replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(bytes);
  } catch (err) {
    console.error('Lecture fichier :', err);
    return res.status(404).json({ error: 'Fichier introuvable dans le stockage' });
  }
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
