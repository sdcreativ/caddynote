/**
 * Smoke PITR staging (S3) — vérifie archive_mode + apparition de segments WAL.
 *
 * Ne restaure pas sur la base principale. Pour un restore PITR destructif
 * (base jetable), suivre docs/PITR_RUNBOOK.md § Restore.
 *
 *   cd server && npm run drill:pitr
 *
 * Env :
 *   DATABASE_URL / DRILL_SOURCE_DATABASE_URL
 *   PITR_WAL_ARCHIVE_PATH  (défaut ../tmp/pg_wal_archive depuis server/)
 *   PITR_COMPOSE_SERVICE   (défaut caddynote-db — pour hint docker)
 *   DRILL_KEEP=1           conserve l’attestation uniquement (pas de DB)
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const sourceUrl = process.env.DRILL_SOURCE_DATABASE_URL || process.env.DATABASE_URL || '';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const archivePath = path.resolve(
  process.env.PITR_WAL_ARCHIVE_PATH || path.join(repoRoot, 'tmp/pg_wal_archive')
);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

const DENY_HOST = [/prod/i, /production/i];

type Step = { id: string; ok: boolean; detail: string };
const steps: Step[] = [];

const record = (id: string, ok: boolean, detail: string) => {
  steps.push({ id, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id} — ${detail}`);
};

const listArchiveFiles = async (): Promise<string[]> => {
  try {
    const entries = await fs.readdir(archivePath);
    return entries.filter((f) => !f.startsWith('.'));
  } catch {
    return [];
  }
};

async function main() {
  console.log('Drill PITR smoke (WAL archive)\n');

  if (!sourceUrl) {
    throw new Error('DATABASE_URL ou DRILL_SOURCE_DATABASE_URL requis');
  }
  if (process.env.CADDYNOTE_DEPLOYMENT === 'production') {
    throw new Error('Refus : CADDYNOTE_DEPLOYMENT=production');
  }

  const u = new URL(sourceUrl);
  const host = u.hostname;
  const database = decodeURIComponent(u.pathname.replace(/^\//, '') || '');
  if (DENY_HOST.some((re) => re.test(host) || re.test(database))) {
    throw new Error(`Refus : host/db suspect prod-like (${host}/${database})`);
  }

  await fs.mkdir(archivePath, { recursive: true });
  const before = await listArchiveFiles();
  record('archive-dir', true, `${archivePath} (${before.length} fichier(s))`);

  const client = new pg.Client({ connectionString: sourceUrl });
  await client.connect();
  try {
    const settings = await client.query<{ name: string; setting: string }>(
      `SELECT name, setting FROM pg_settings
       WHERE name IN ('archive_mode', 'archive_command', 'archive_timeout', 'wal_level')
       ORDER BY name`
    );
    const map = Object.fromEntries(settings.rows.map((r) => [r.name, r.setting]));
    const modeOk = map.archive_mode === 'on';
    record(
      'archive_mode',
      modeOk,
      modeOk
        ? `on (wal_level=${map.wal_level}, timeout=${map.archive_timeout}s)`
        : `attendu on, reçu « ${map.archive_mode} » — activer docker-compose.pitr.yml`
    );
    if (!modeOk) {
      console.error(
        '\nHint : docker compose -f docker-compose.yml -f docker-compose.pitr.yml up -d caddynote-db'
      );
    }

    const cmd = map.archive_command || '';
    const cmdOk = cmd.length > 0 && cmd !== '(disabled)' && !cmd.includes('/dev/null');
    record('archive_command', cmdOk, cmdOk ? cmd.slice(0, 120) : `invalide : ${cmd || '(vide)'}`);

    const timeoutRaw = map.archive_timeout || '';
    let timeoutSec = Number.NaN;
    if (/^\d+$/.test(timeoutRaw)) {
      timeoutSec = Number(timeoutRaw);
    } else {
      const minMatch = timeoutRaw.match(/^(\d+)\s*min$/i);
      if (minMatch) timeoutSec = Number(minMatch[1]) * 60;
    }
    const timeoutOk = Number.isFinite(timeoutSec) && timeoutSec > 0 && timeoutSec <= 900;
    record(
      'archive_timeout',
      timeoutOk,
      timeoutOk
        ? `${timeoutRaw} (≤ 900s → RPO archive borné à 15 min)`
        : `${timeoutRaw} — viser 900s / 15min pour RPO 15 min`
    );

    // Activité + switch WAL pour forcer archive_command.
    await client.query(`CREATE TABLE IF NOT EXISTS _pitr_smoke_marker (id int, ts timestamptz)`);
    await client.query(`INSERT INTO _pitr_smoke_marker(id, ts) VALUES (1, now())`);
    const sw = await client.query<{ pg_switch_wal: string }>('SELECT pg_switch_wal()::text');
    record('pg_switch_wal', true, `lsn=${sw.rows[0]?.pg_switch_wal ?? '?'}`);

    // Laisser le temps à archive_command (cp) de tourner.
    let after = before;
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 500));
      after = await listArchiveFiles();
      if (after.length > before.length) break;
    }
    const newFiles = after.filter((f) => !before.includes(f));
    const walOk = newFiles.length > 0;
    record(
      'wal-archived',
      walOk,
      walOk
        ? `+${newFiles.length} : ${newFiles.slice(0, 3).join(', ')}${newFiles.length > 3 ? '…' : ''}`
        : `aucun nouveau fichier dans ${archivePath} — droits du bind mount ? (chmod 777 tmp/pg_wal_archive)`
    );

    await client.query(`DROP TABLE IF EXISTS _pitr_smoke_marker`);
  } finally {
    await client.end();
  }

  const attestDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../pitr-attestations');
  await fs.mkdir(attestDir, { recursive: true });
  const attestPath = path.join(attestDir, `pitr-smoke-${stamp}.md`);
  const allOk = steps.every((s) => s.ok);
  const body = `# Attestation PITR smoke — ${stamp}

| Champ | Valeur |
|-------|--------|
| Host/db | ${host} / ${database} |
| Archive path | ${archivePath} |
| Verdict | ${allOk ? 'PASS' : 'FAIL'} |
| Operateur | ${process.env.USER || process.env.USERNAME || 'unknown'} |

## Étapes

${steps.map((s) => `- [${s.ok ? 'x' : ' '}] **${s.id}** — ${s.detail}`).join('\n')}

## Restore PITR (manuel, hors smoke)

Voir \`docs/PITR_RUNBOOK.md\` § Restore à \`recovery_target_time\`.
Ce smoke **ne** restaure **pas** la base principale.
`;
  await fs.writeFile(attestPath, body, 'utf8');
  console.log(`\nAttestation : ${attestPath}`);

  if (!allOk) {
    process.exitCode = 1;
    console.error('Drill PITR FAIL');
    return;
  }
  console.log('Drill PITR smoke OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
