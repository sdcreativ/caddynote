import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { scheduleExclusiveCron } from './cronLock.js';
import cron from 'node-cron';
import { isS3Configured, uploadObject, listObjects, deleteObject } from './s3.js';

/**
 * NFR-005/006 (RPO/RTO) : jusqu'ici, la ligne d'audit disait « sauvegardes
 * gérées par Supabase aujourd'hui » — obsolète depuis que Supabase a été
 * entièrement retiré (voir `docs/MIGRATION_SUPABASE_TO_POSTGRES.md`) : plus
 * rien ne sauvegardait la base applicative. Aucune tâche planifiée, aucun
 * script, aucune ligne de code liée aux sauvegardes n'existait dans le
 * dépôt.
 *
 * `pg_dump --format=custom` (compressé nativement, restaurable sélectivement
 * table par table si besoin) plutôt qu'un export SQL brut. Uploadé sur le
 * stockage S3 déjà en place (`lib/s3.ts`, gated) — jamais laissé seulement
 * sur le disque du conteneur applicatif, qui est éphémère par nature ; une
 * sauvegarde qui disparaît avec le conteneur qu'elle est censée protéger ne
 * protège rien. Si S3 n'est pas configuré, la sauvegarde reste locale et
 * l'absence de durabilité réelle est explicitement signalée (jamais un faux
 * sentiment de sécurité).
 */
export const BACKUP_S3_PREFIX = 'backups/database/';

export interface BackupResult {
  filename: string;
  sizeBytes: number;
  durationMs: number;
  uploadedToS3: boolean;
  /** Présent seulement si S3 n'est pas configuré : la sauvegarde reste sur
   * le disque local (éphémère), à récupérer manuellement. */
  localPath?: string;
}

const runPgDump = (databaseUrl: string, outputPath: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const proc = spawn('pg_dump', [databaseUrl, '--format=custom', '--file', outputPath]);
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', (err) => {
      // ENOENT typiquement : pg_dump absent de l'image (voir Dockerfile,
      // paquet postgresql16-client) — jamais un échec silencieux.
      reject(new Error(`Impossible de lancer pg_dump : ${err.message}`));
    });
    proc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_dump a échoué (code ${code}) : ${stderr.trim()}`));
    });
  });

export const runDatabaseBackup = async (databaseUrl = process.env.DATABASE_URL): Promise<BackupResult> => {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL manquant — impossible de lancer la sauvegarde');
  }
  const start = Date.now();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `caddynote_${timestamp}.dump`;
  const localPath = path.join(os.tmpdir(), filename);

  await runPgDump(databaseUrl, localPath);
  const stat = await fs.stat(localPath);
  const durationMs = Date.now() - start;

  if (isS3Configured()) {
    const body = await fs.readFile(localPath);
    await uploadObject(`${BACKUP_S3_PREFIX}${filename}`, body, 'application/octet-stream');
    await fs.unlink(localPath);
    return { filename, sizeBytes: stat.size, durationMs, uploadedToS3: true };
  }

  return { filename, sizeBytes: stat.size, durationMs, uploadedToS3: false, localPath };
};

export interface CleanupResult {
  deletedKeys: string[];
  retainedCount: number;
}

/** Supprime les sauvegardes S3 plus anciennes que la rétention configurée.
 * Sans objet si S3 n'est pas configuré (rien à nettoyer côté serveur — les
 * sauvegardes locales, elles, ne survivent de toute façon pas au
 * redémarrage du conteneur). */
export const cleanupOldBackups = async (retentionDays = Number(process.env.BACKUP_RETENTION_DAYS) || 30): Promise<CleanupResult> => {
  if (!isS3Configured()) {
    return { deletedKeys: [], retainedCount: 0 };
  }
  const objects = await listObjects(BACKUP_S3_PREFIX);
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const expired = objects.filter((o) => o.lastModified.getTime() < cutoff);
  for (const obj of expired) {
    await deleteObject(obj.key);
  }
  return { deletedKeys: expired.map((o) => o.key), retainedCount: objects.length - expired.length };
};

export interface VerifyBackupResult {
  ok: boolean;
  source: 'local' | 's3';
  filename?: string;
  tocEntries?: number;
  detail: string;
}

/** Vérifie qu'un dump custom est lisible (`pg_restore --list`) — pas une
 * restauration complète (destructive). Sert de smoke test hebdomadaire. */
export const verifyBackupFile = async (dumpPath: string): Promise<VerifyBackupResult> =>
  new Promise((resolve) => {
    const proc = spawn('pg_restore', ['--list', dumpPath]);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', (err) => {
      resolve({
        ok: false,
        source: 'local',
        detail: `Impossible de lancer pg_restore : ${err.message}`,
      });
    });
    proc.on('exit', (code) => {
      if (code !== 0) {
        resolve({
          ok: false,
          source: 'local',
          detail: `pg_restore --list a échoué (code ${code}) : ${stderr.trim()}`,
        });
        return;
      }
      const tocEntries = stdout.split('\n').filter((l) => l.trim().length > 0).length;
      resolve({
        ok: tocEntries > 0,
        source: 'local',
        filename: path.basename(dumpPath),
        tocEntries,
        detail: tocEntries > 0 ? `TOC lisible (${tocEntries} entrées)` : 'TOC vide',
      });
    });
  });

let started = false;

/** Démarre la sauvegarde planifiée. Cron configurable via `BACKUP_CRON`
 * (défaut `0 3 * * *` → RPO 24h). Documenter tout changement dans
 * `docs/SAUVEGARDE_RESTAURATION.md` et éventuellement `BACKUP_RPO_HOURS`. */
export const startDatabaseBackupCron = (): void => {
  if (started) return;
  started = true;
  const expression = process.env.BACKUP_CRON || '0 3 * * *';
  if (!cron.validate(expression)) {
    console.error(`BACKUP_CRON invalide (« ${expression} ») — fallback 0 3 * * *`);
  }
  const schedule = cron.validate(expression) ? expression : '0 3 * * *';
  scheduleExclusiveCron(schedule, 'database-backup', async () => {
    const result = await runDatabaseBackup();
    console.log(
      `⏰ Sauvegarde base de données : ${result.filename} (${(result.sizeBytes / 1024 / 1024).toFixed(1)} Mo, ${result.durationMs}ms)${result.uploadedToS3 ? ' — envoyée sur S3' : ' — ⚠️ conservée localement uniquement, S3 non configuré'}`
    );
    const { deletedKeys } = await cleanupOldBackups();
    if (deletedKeys.length > 0) {
      console.log(`⏰ Nettoyage sauvegardes : ${deletedKeys.length} sauvegarde(s) expirée(s) supprimée(s)`);
    }
  });
  console.log(`⏰ Tâche planifiée « sauvegarde base de données » enregistrée (cron=${schedule}, RPO indicatif=${process.env.BACKUP_RPO_HOURS || 24}h)`);
};
