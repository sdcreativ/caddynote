import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import fs from 'node:fs/promises';
import request from 'supertest';
import { app } from '../index.js';
import { runDatabaseBackup, cleanupOldBackups } from '../lib/backup.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * NFR-005/006 (RPO/RTO) — jusqu'ici « sauvegardes gérées par Supabase
 * aujourd'hui », obsolète depuis le retrait complet de Supabase : plus rien
 * ne sauvegardait la base applicative. Cette suite exécute un vrai
 * `pg_dump` contre la base de test (pas un mock) — voir
 * `docs/SAUVEGARDE_RESTAURATION.md` pour la mesure réelle (dump + restauration
 * complète, chronométrée) qui a servi à fixer les objectifs RPO/RTO.
 */
describe('Sauvegarde base de données (NFR-005/006)', () => {
  let fx: Fixture;
  const producedFiles: string[] = [];

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  afterEach(async () => {
    for (const file of producedFiles.splice(0)) {
      await fs.unlink(file).catch(() => {});
    }
  });

  it('runDatabaseBackup() produit un vrai fichier de sauvegarde non vide (pg_dump réel, pas simulé)', async () => {
    const result = await runDatabaseBackup();
    if (result.localPath) producedFiles.push(result.localPath);

    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThan(0);
    // S3 non configuré dans cet environnement de test : la sauvegarde reste locale.
    expect(result.uploadedToS3).toBe(false);
    expect(result.localPath).toBeTruthy();

    const stat = await fs.stat(result.localPath!);
    expect(stat.size).toBe(result.sizeBytes);
  }, 20000);

  it('échoue explicitement (jamais silencieusement) sur une URL de base invalide', async () => {
    await expect(runDatabaseBackup('postgresql://user:wrong@127.0.0.1:5432/base_qui_nexiste_pas')).rejects.toThrow();
  }, 20000);

  it('lève une erreur claire si DATABASE_URL est totalement absent', async () => {
    // Une chaîne vide plutôt que `undefined` : un paramètre par défaut ne se
    // substitue qu'à `undefined` — passer `undefined` ici retomberait sur le
    // vrai `process.env.DATABASE_URL` de l'environnement de test, ce qui ne
    // testerait rien.
    await expect(runDatabaseBackup('')).rejects.toThrow('DATABASE_URL manquant');
  });

  it('cleanupOldBackups() sans S3 configuré ne supprime rien et le dit explicitement', async () => {
    const result = await cleanupOldBackups();
    expect(result).toEqual({ deletedKeys: [], retainedCount: 0 });
  });

  it('POST /backups/run est réservé à l’admin global', async () => {
    const res = await request(app).post('/backups/run').set(auth(fx.a.schoolAdmin.token));
    expect(res.status).toBe(403);
  });

  it('POST /backups/run déclenche une vraie sauvegarde pour un admin global', async () => {
    const res = await request(app).post('/backups/run').set(auth(fx.globalAdmin.token));
    expect(res.status).toBe(200);
    expect(res.body.backup.sizeBytes).toBeGreaterThan(0);
    if (res.body.backup.localPath) producedFiles.push(res.body.backup.localPath);
  }, 20000);

  it('GET /backups indique explicitement que S3 n’est pas configuré, sans erreur', async () => {
    const res = await request(app).get('/backups').set(auth(fx.globalAdmin.token));
    expect(res.status).toBe(200);
    expect(res.body.s3Configured).toBe(false);
    expect(res.body.backups).toEqual([]);
  });

  it('POST /backups/cleanup est réservé à l’admin global', async () => {
    const res = await request(app).post('/backups/cleanup').set(auth(fx.a.teacher.token));
    expect(res.status).toBe(403);
  });
});
