/**
 * Recette locale — Lots 11/12 (NFR / sécu), ce qui est jouable sans pilote.
 *
 *   cd server && npx tsx scripts/recette-nfr.ts
 *
 * k6 rentrée/bulletins et Lighthouse clavier restent à jouer sur le pilote.
 * Pentest externe : hors dépôt.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Step = { id: string; ok: boolean; detail: string };
const steps: Step[] = [];

const record = (id: string, ok: boolean, detail: string) => {
  steps.push({ id, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id} — ${detail}`);
};

const skip = (id: string, detail: string) => {
  steps.push({ id, ok: true, detail });
  console.log(`SKIP  ${id} — ${detail}`);
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const serverDir = path.join(root, 'server');

const auditJson = (cwd: string): { vulnerabilities?: Record<string, { severity?: string }> } => {
  try {
    const out = execFileSync('npm', ['audit', '--json'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return JSON.parse(out) as { vulnerabilities?: Record<string, { severity?: string }> };
  } catch (error) {
    const err = error as { stdout?: string };
    if (err.stdout) {
      try {
        return JSON.parse(err.stdout) as { vulnerabilities?: Record<string, { severity?: string }> };
      } catch {
        /* fall through */
      }
    }
    throw error;
  }
};

const countSeverity = (report: { vulnerabilities?: Record<string, { severity?: string }> }, min: 'high' | 'critical') => {
  const order = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
  const threshold = order[min];
  return Object.values(report.vulnerabilities ?? {}).filter((v) => order[(v.severity ?? 'info') as keyof typeof order] >= threshold)
    .length;
};

async function main() {
  const sessionFile = path.join(serverDir, 'loadtest/output/session.json');
  if (existsSync(sessionFile)) {
    skip('NFR-P', 'session k6 présente — lancer manuellement loadtest/rentree.js contre le pilote (p95 < 500 ms)');
    skip('NFR-B', 'session k6 présente — lancer manuellement loadtest/bulletins.js (p95 écriture < 800 ms)');
  } else {
    skip('NFR-P', 'k6 rentree.js non rejoué ici (seed loadtest + image k6 requis, docs/SLO.md)');
    skip('NFR-B', 'k6 bulletins.js non rejoué ici (même prérequis que NFR-P)');
  }
  skip('NFR-A', 'clavier + Lighthouse : hors jsdom, à valider en rendu réel sur le pilote');

  const serverAudit = auditJson(serverDir);
  const serverHigh = countSeverity(serverAudit, 'high');
  record(
    'SEC-D-server',
    serverHigh === 0,
    serverHigh === 0 ? 'npm audit server : aucun high/critical' : `npm audit server : ${serverHigh} high/critical`
  );

  const frontAudit = auditJson(root);
  const frontCritical = countSeverity(frontAudit, 'critical');
  record(
    'SEC-D-front',
    frontCritical === 0,
    frontCritical === 0 ? 'npm audit frontend : aucun critical' : `npm audit frontend : ${frontCritical} critical`
  );

  skip(
    'SEC-P',
    'pentest externe hors dépôt — préparer avec `npm run pentest:prep` + docs/PENTEST_RUNBOOK.md ; isolation ORG-004 en CI'
  );

  const failed = steps.filter((s) => !s.ok);
  console.log(`\nNFR : ${steps.filter((s) => s.ok).length}/${steps.length} pass (skips inclus)`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
