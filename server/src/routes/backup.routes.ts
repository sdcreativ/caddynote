import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  runDatabaseBackup,
  cleanupOldBackups,
  verifyBackupFile,
  BACKUP_S3_PREFIX,
} from '../lib/backup.js';
import { isS3Configured, listObjects, getObjectBytes, getPresignedDownloadUrl } from '../lib/s3.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { logAudit } from '../lib/audit.js';

/**
 * NFR-005/006 (RPO/RTO) : opération de plateforme — admin global.
 * Restauration destructive hors API (téléchargement + verify + runbook).
 */
export const backupRouter = Router();
backupRouter.use(requireAuth);

backupRouter.post('/run', requireRole('admin'), async (_req, res) => {
  try {
    const result = await runDatabaseBackup();
    res.json({ backup: result });
  } catch (error) {
    console.error('Erreur lors de la sauvegarde manuelle:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Échec de la sauvegarde' });
  }
});

backupRouter.get('/', requireRole('admin'), async (_req, res) => {
  if (!isS3Configured()) {
    return res.json({ backups: [], s3Configured: false });
  }
  const objects = await listObjects(BACKUP_S3_PREFIX);
  const backups = objects
    .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())
    .map((o) => ({ key: o.key, sizeBytes: o.sizeBytes, lastModified: o.lastModified }));
  res.json({ backups, s3Configured: true });
});

backupRouter.post('/cleanup', requireRole('admin'), async (_req, res) => {
  const result = await cleanupOldBackups();
  res.json(result);
});

const keySchema = z.object({
  key: z.string().min(1).max(512),
});

const assertBackupKey = (key: string): boolean =>
  key.startsWith(BACKUP_S3_PREFIX) && !key.includes('..') && !path.isAbsolute(key);

/** URL présignée de téléchargement (1h). */
backupRouter.post('/download-url', requireRole('admin'), async (req, res) => {
  if (!isS3Configured()) {
    return res.status(501).json({ error: 'S3 non configuré' });
  }
  const parsed = keySchema.safeParse(req.body ?? {});
  if (!parsed.success || !assertBackupKey(parsed.data.key)) {
    return res.status(400).json({ error: 'Clé de sauvegarde invalide' });
  }
  const downloadUrl = await getPresignedDownloadUrl(parsed.data.key, 3600);
  await logAudit({
    actorId: req.auth!.sub,
    action: 'backup.download_url',
    targetType: 'backup',
    targetId: parsed.data.key,
  });
  res.json({ downloadUrl, expiresIn: 3600, key: parsed.data.key });
});

const verifySchema = z.object({
  localPath: z.string().min(1).optional(),
  key: z.string().min(1).max(512).optional(),
});

/** Smoke test : `pg_restore --list` sur une sauvegarde S3 (key) ou la dernière. */
backupRouter.post('/verify', requireRole('admin'), async (req, res) => {
  const parsed = verifySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }

  if (isS3Configured()) {
    const objects = await listObjects(BACKUP_S3_PREFIX);
    let target = objects.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())[0];
    if (parsed.data.key) {
      if (!assertBackupKey(parsed.data.key)) {
        return res.status(400).json({ error: 'Clé de sauvegarde invalide' });
      }
      const found = objects.find((o) => o.key === parsed.data.key);
      if (!found) {
        return res.status(404).json({ ok: false, source: 's3', detail: 'Sauvegarde introuvable' });
      }
      target = found;
    }
    if (!target) {
      return res.json({ ok: false, source: 's3', detail: 'Aucune sauvegarde S3 trouvée' });
    }
    const tmp = path.join(os.tmpdir(), path.basename(target.key));
    try {
      const body = await getObjectBytes(target.key);
      await fs.writeFile(tmp, body);
      const result = await verifyBackupFile(tmp);
      await logAudit({
        actorId: req.auth!.sub,
        action: 'backup.verify',
        targetType: 'backup',
        targetId: target.key,
        metadata: { ok: result.ok },
      });
      return res.json({ ...result, source: 's3', filename: path.basename(target.key), key: target.key });
    } finally {
      await fs.unlink(tmp).catch(() => {});
    }
  }

  if (parsed.data.localPath) {
    const result = await verifyBackupFile(parsed.data.localPath);
    return res.json(result);
  }

  return res.status(501).json({
    ok: false,
    source: 'none',
    detail:
      'S3 non configuré et aucun localPath fourni — lancez POST /backups/run puis /verify avec localPath, ou configurez S3.',
  });
});
