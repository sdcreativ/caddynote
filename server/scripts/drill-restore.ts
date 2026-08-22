/**
 * Drill restauration logique complète (NFR-005/006 / S2).
 *
 * pg_dump source → base jetable → pg_restore → counts sentinelles → attestation.
 * Ne touche jamais la base source. Refuse production.
 *
 *   cd server && npm run drill:restore
 *
 * Env :
 *   DRILL_SOURCE_DATABASE_URL  (défaut DATABASE_URL)
 *   DRILL_ADMIN_DATABASE_URL   (défaut : même host, DB postgres — pour CREATE/DROP)
 *   DRILL_KEEP=1               conserve la DB jetable
 *   DRILL_API_URL              optionnel : GET /health après restore (si API pointée)
 */
import 'dotenv/config';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const sourceUrl = process.env.DRILL_SOURCE_DATABASE_URL || process.env.DATABASE_URL || '';
const keep = process.env.DRILL_KEEP === '1' || process.env.DRILL_KEEP === 'true';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const drillDbName = `caddynote_drill_${stamp.replace(/-/g, '').slice(0, 18)}`;

const DENY_HOST = [/prod/i, /production/i];

type Counts = { profiles: number; institutions: number };

const run = (cmd: string, args: string[]): Promise<{ code: number; stderr: string }> =>
  new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (c) => {
      stderr += c.toString();
    });
    proc.on('error', reject);
    proc.on('exit', (code) => resolve({ code: code ?? 1, stderr }));
  });

const parseUrl = (url: string) => {
  const u = new URL(url);
  const database = decodeURIComponent(u.pathname.replace(/^\//, '') || '');
  return { u, database, host: u.hostname };
};

const adminUrlFrom = (url: string, adminDb = 'postgres') => {
  const { u } = parseUrl(url);
  u.pathname = `/${adminDb}`;
  return u.toString();
};

const targetUrlFrom = (url: string, dbName: string) => {
  const { u } = parseUrl(url);
  u.pathname = `/${dbName}`;
  return u.toString();
};

const countSentinels = async (databaseUrl: string): Promise<Counts> => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const profiles = await client.query<{ c: string }>('SELECT count(*)::text AS c FROM strk_profiles');
    const institutions = await client.query<{ c: string }>(
      'SELECT count(*)::text AS c FROM strk_institutions'
    );
    return {
      profiles: Number(profiles.rows[0]?.c ?? 0),
      institutions: Number(institutions.rows[0]?.c ?? 0),
    };
  } finally {
    await client.end();
  }
};

async function main() {
  console.log('Drill restore logique\n');

  if (!sourceUrl) {
    throw new Error('DRILL_SOURCE_DATABASE_URL ou DATABASE_URL requis');
  }
  if (process.env.CADDYNOTE_DEPLOYMENT === 'production') {
    throw new Error('Refus : CADDYNOTE_DEPLOYMENT=production');
  }

  const { host, database: sourceDb } = parseUrl(sourceUrl);
  if (DENY_HOST.some((re) => re.test(host) || re.test(sourceDb))) {
    throw new Error(`Refus : host/db suspect prod-like (${host}/${sourceDb})`);
  }
  if (sourceDb.includes('prod') || sourceDb === 'caddynote_production') {
    throw new Error(`Refus : base source « ${sourceDb} »`);
  }

  const adminUrl = process.env.DRILL_ADMIN_DATABASE_URL || adminUrlFrom(sourceUrl);
  const targetUrl = targetUrlFrom(sourceUrl, drillDbName);

  console.log(`Source : ${host}/${sourceDb}`);
  console.log(`Cible  : ${drillDbName}`);

  const before = await countSentinels(sourceUrl);
  console.log(`Sentinelles source : profiles=${before.profiles} institutions=${before.institutions}`);

  const dumpPath = path.join(os.tmpdir(), `${drillDbName}.dump`);
  const t0 = Date.now();
  const dump = await run('pg_dump', [sourceUrl, '--format=custom', '--file', dumpPath]);
  if (dump.code !== 0) throw new Error(`pg_dump échoué : ${dump.stderr}`);
  const dumpMs = Date.now() - t0;
  const dumpStat = await fs.stat(dumpPath);
  console.log(`Dump OK (${(dumpStat.size / 1024).toFixed(1)} KiB, ${dumpMs} ms)`);

  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${drillDbName}"`);
  } finally {
    await admin.end();
  }

  const t1 = Date.now();
  const restore = await run('pg_restore', [
    '--no-owner',
    '--no-privileges',
    '--dbname',
    targetUrl,
    dumpPath,
  ]);
  // pg_restore peut renvoyer 1 pour warnings non fatals — on vérifie les counts
  const restoreMs = Date.now() - t1;
  if (restore.code > 1) {
    throw new Error(`pg_restore échoué (code ${restore.code}) : ${restore.stderr}`);
  }
  console.log(`Restore terminé (${restoreMs} ms, exit=${restore.code})`);

  const after = await countSentinels(targetUrl);
  const countsOk =
    after.profiles === before.profiles && after.institutions === before.institutions;
  console.log(
    `Sentinelles cible : profiles=${after.profiles} institutions=${after.institutions} ${countsOk ? 'OK' : 'MISMATCH'}`
  );

  let apiHealth: string | null = null;
  if (process.env.DRILL_API_URL) {
    try {
      const res = await fetch(`${process.env.DRILL_API_URL.replace(/\/$/, '')}/health`);
      apiHealth = `${res.status}`;
    } catch (e) {
      apiHealth = `error: ${(e as Error).message}`;
    }
  }

  const attestDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drill-attestations');
  await fs.mkdir(attestDir, { recursive: true });
  const attestPath = path.join(attestDir, `restore-${stamp}.md`);
  const body = `# Attestation drill restore — ${stamp}

| Champ | Valeur |
|-------|--------|
| Source host/db | ${host} / ${sourceDb} |
| Cible | ${drillDbName} |
| Dump size | ${dumpStat.size} bytes |
| Dump duration | ${dumpMs} ms |
| Restore duration | ${restoreMs} ms |
| profiles | ${before.profiles} → ${after.profiles} |
| institutions | ${before.institutions} → ${after.institutions} |
| Counts match | ${countsOk} |
| pg_restore exit | ${restore.code} |
| API health | ${apiHealth ?? 'n/a'} |
| Operateur | ${process.env.USER || process.env.USERNAME || 'unknown'} |

Verdict : ${countsOk ? 'PASS' : 'FAIL'}
`;
  await fs.writeFile(attestPath, body, 'utf8');
  console.log(`Attestation : ${attestPath}`);

  await fs.unlink(dumpPath).catch(() => undefined);

  if (!keep) {
    const drop = new pg.Client({ connectionString: adminUrl });
    await drop.connect();
    try {
      await drop.query(`DROP DATABASE IF EXISTS "${drillDbName}" WITH (FORCE)`);
      console.log(`DB jetable ${drillDbName} supprimée`);
    } finally {
      await drop.end();
    }
  } else {
    console.log(`DRILL_KEEP : base conservée ${drillDbName}`);
  }

  if (!countsOk) {
    process.exitCode = 1;
    console.error('Drill FAIL — counts mismatch');
    return;
  }
  console.log('Drill restore OK');
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
