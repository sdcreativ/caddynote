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

// Dossiers autorisés : évite qu'un appelant écrive n'importe où dans le
// bucket (ex. usurper le dossier "avatars" d'un autre module).
const ALLOWED_FOLDERS = ['avatars', 'documents', 'assignments', 'messages', 'receipts', 'course-materials'] as const;

// DOC-005 : type MIME et taille maximale par dossier — jusqu'ici
// `contentType` était un texte libre jamais vérifié (n'importe quel type,
// y compris exécutable/HTML) et rien ne bornait la taille du fichier (une
// URL signée simple ne le permet pas ; voir `createPresignedUploadPost`).
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const FOLDER_RULES: Record<(typeof ALLOWED_FOLDERS)[number], { types: readonly string[]; maxSizeBytes: number }> = {
  avatars: { types: IMAGE_TYPES, maxSizeBytes: 5 * 1024 * 1024 },
  documents: { types: [...IMAGE_TYPES, 'application/pdf'], maxSizeBytes: 10 * 1024 * 1024 },
  assignments: {
    types: [
      ...IMAGE_TYPES,
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    maxSizeBytes: 20 * 1024 * 1024,
  },
  messages: { types: [...IMAGE_TYPES, 'application/pdf'], maxSizeBytes: 10 * 1024 * 1024 },
  receipts: { types: [...IMAGE_TYPES, 'application/pdf'], maxSizeBytes: 10 * 1024 * 1024 },
  'course-materials': {
    types: [
      ...IMAGE_TYPES,
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    maxSizeBytes: 20 * 1024 * 1024,
  },
};

const presignUploadSchema = z.object({
  folder: z.enum(ALLOWED_FOLDERS),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1),
});

// Upload direct navigateur -> S3 via POST signé (DOC-005 : jamais d'objet
// public, jamais de fichier qui transite par notre serveur applicatif ;
// type MIME et taille imposés par S3 lui-même via les conditions de policy,
// pas seulement contrôlés ici avant signature). Validation de la requête
// avant la vérification de configuration S3 (pas l'inverse) : une requête
// mal formée doit être rejetée pour ce qu'elle est (400), pas masquée
// derrière un 501 qui laisserait croire que tout irait bien une fois S3
// configuré.
filesRouter.post('/presign-upload', async (req, res) => {
  const parsed = presignUploadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const rules = FOLDER_RULES[parsed.data.folder];
  if (!rules.types.includes(parsed.data.contentType)) {
    return res.status(400).json({ error: `Type de fichier non autorisé pour ce dossier (autorisés : ${rules.types.join(', ')})` });
  }
  if (!isS3Configured()) {
    return res.status(501).json({
      error: "Le stockage de fichiers n'est pas configuré sur cette instance (variables S3_* manquantes). Contactez SDCREATIV.",
    });
  }
  // SAA-003 : refuse un nouvel upload si le plafond stockage du plan est déjà atteint.
  if (req.auth!.institutionId) {
    const storageQuota = await checkQuota(req.auth!.institutionId, 'storageGb', 0);
    if (!storageQuota.allowed) {
      return res.status(403).json({
        error: `Quota de ${QUOTA_LABELS.storageGb} atteint (${storageQuota.current}/${storageQuota.limit} Go).`,
        quota: storageQuota,
      });
    }
  }
  // ORG-004 : la clé embarque le périmètre tenant de l'appelant (établissement,
  // ou compte pour les rôles sans établissement) — vérifié symétriquement au
  // téléchargement pour qu'un objet ne fuite jamais vers un autre tenant.
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
  const folder = ALLOWED_FOLDERS.find((f) => parsed.data.key.startsWith(`${f}/`));
  if (!folder) {
    return res.status(400).json({ error: 'Clé de fichier invalide' });
  }
  // Un objet ne peut être téléchargé que par un appelant du même périmètre
  // tenant que celui qui l'a déposé (ou l'admin global) — sans ça, connaître
  // (ou trouver via un lien partagé) la clé d'un objet suffisait à le
  // télécharger depuis n'importe quel autre établissement (fuite ORG-004 /
  // DOC-005).
  if (!isGlobalAdmin(req.auth!) && !isOwnedObjectKey(parsed.data.key, folder, req.auth!.institutionId, req.auth!.sub)) {
    return res.status(403).json({ error: 'Accès refusé à ce fichier' });
  }
  const downloadUrl = await getPresignedDownloadUrl(parsed.data.key);
  res.json({ downloadUrl, expiresIn: 3600 });
});

const purgeSchema = z.object({ dryRun: z.boolean().optional() });

// DOC-005 : purge rétention — dry-run par défaut ; destructif seulement si
// FILE_PURGE_ENABLED=true et dryRun:false.
filesRouter.post('/purge', requireRole('admin'), async (req, res) => {
  const parsed = purgeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const result = await runFilePurge({ dryRun: parsed.data.dryRun });
  res.json(result);
});
