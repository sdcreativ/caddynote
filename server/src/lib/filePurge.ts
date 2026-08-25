import { scheduleExclusiveCron } from './cronLock.js';
import { prisma } from './prisma.js';
import { isS3Configured, listObjects, deleteObject } from './s3.js';
import { logAudit } from './audit.js';

/**
 * DOC-005 — purge de rétention fichiers.
 * Par défaut : **dry-run uniquement** (liste les candidats). La suppression
 * réelle exige `FILE_PURGE_ENABLED=true` *et* `dryRun: false` sur l’appel /
 * le cron — jamais d’activation silencieuse.
 *
 * Périmètre initial volontairement restreint :
 * - `inscription/` : dossiers `rejected`/`cancelled` dont `updatedAt` > 365 j
 * - `messages/` : objets S3 plus vieux que 730 j (pas de jointure fiable
 *   message↔clé dans tous les cas — se base sur LastModified S3)
 *
 * Les dossiers `recus` / `devoirs` restent hors purge auto tant que
 * SDCREATIV n’a pas validé la politique (`docs/POLITIQUE_CONSERVATION_FICHIERS.md`).
 */

export interface PurgeCandidate {
  key: string;
  reason: string;
  sizeBytes: number;
}

export interface PurgeResult {
  dryRun: boolean;
  candidates: PurgeCandidate[];
  deleted: string[];
  errors: { key: string; error: string }[];
}

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

export const planFilePurge = async (): Promise<PurgeCandidate[]> => {
  const candidates: PurgeCandidate[] = [];

  // Candidats DB : planifiables même sans S3 (dry-run ops / tests).
  const staleApps = await prisma.strkAdmissionApplication.findMany({
    where: {
      status: { in: ['rejected', 'cancelled'] },
      updatedAt: { lt: daysAgo(365) },
    },
    select: { id: true, documents: true },
    take: 500,
  });
  for (const app of staleApps) {
    const docs = (app.documents as { fileKey?: string }[] | null) ?? [];
    for (const d of docs) {
      if (d.fileKey) {
        candidates.push({
          key: d.fileKey,
          reason: `admission ${app.id} rejected/cancelled > 365j`,
          sizeBytes: 0,
        });
      }
    }
  }

  if (isS3Configured()) {
    try {
      const messageObjects = await listObjects('messages/');
      const cutoff = daysAgo(730).getTime();
      for (const obj of messageObjects) {
        if (obj.lastModified.getTime() < cutoff) {
          candidates.push({
            key: obj.key,
            reason: 'messages LastModified > 730j',
            sizeBytes: obj.sizeBytes,
          });
        }
      }
    } catch (error) {
      console.error('Purge: list messages/ échoué:', error);
    }
  }

  // Dédupliquer par clé
  const byKey = new Map<string, PurgeCandidate>();
  for (const c of candidates) byKey.set(c.key, c);
  return [...byKey.values()];
};

export const runFilePurge = async (opts: { dryRun?: boolean } = {}): Promise<PurgeResult> => {
  const allowDestructive = process.env.FILE_PURGE_ENABLED === 'true';
  const dryRun = opts.dryRun !== false || !allowDestructive;
  const candidates = await planFilePurge();
  const deleted: string[] = [];
  const errors: { key: string; error: string }[] = [];

  if (!dryRun) {
    for (const c of candidates) {
      try {
        await deleteObject(c.key);
        deleted.push(c.key);
      } catch (error) {
        errors.push({ key: c.key, error: error instanceof Error ? error.message : 'delete failed' });
      }
    }
    await logAudit({
      institutionId: null,
      actorId: null,
      action: 'files.purge_executed',
      metadata: { deleted: deleted.length, errors: errors.length, candidates: candidates.length },
    });
  } else {
    await logAudit({
      institutionId: null,
      actorId: null,
      action: 'files.purge_dry_run',
      metadata: { candidates: candidates.length },
    });
  }

  return { dryRun, candidates, deleted, errors };
};

let started = false;

export const startFilePurgeCron = (): void => {
  if (started) return;
  started = true;
  // Hebdomadaire dimanche 4h — toujours dry-run sauf FILE_PURGE_ENABLED=true
  scheduleExclusiveCron('0 4 * * 0', 'file-purge', async () => {
    const r = await runFilePurge({ dryRun: process.env.FILE_PURGE_ENABLED !== 'true' });
    console.log(
      `⏰ Purge fichiers : ${r.candidates.length} candidat(s), dryRun=${r.dryRun}, deleted=${r.deleted.length}`
    );
  });
  console.log('⏰ Tâche planifiée « purge fichiers » enregistrée (dimanche 4h, dry-run par défaut)');
};
