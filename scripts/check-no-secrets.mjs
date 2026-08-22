#!/usr/bin/env node
/**
 * §7.1 — refuse les fichiers secrets accidentellement trackés par git.
 * Usage : node scripts/check-no-secrets.mjs
 */
import { execSync } from 'node:child_process';

const FORBIDDEN = [
  /^\.env$/,
  /^\.env\.(?!example$).+/,
  /\.pem$/i,
  /\.key$/i,
  /credentials\.json$/i,
  /service-account.*\.json$/i,
  /id_rsa$/i,
];

let tracked = '';
try {
  tracked = execSync('git ls-files -z', { encoding: 'utf8' });
} catch (e) {
  console.error('git ls-files impossible — hors dépôt ?');
  process.exit(1);
}

const files = tracked.split('\0').filter(Boolean);
const bad = files.filter((f) => FORBIDDEN.some((re) => re.test(f) || re.test(f.split('/').pop() || '')));

if (bad.length) {
  console.error('✗ Fichiers secrets trackés (à retirer de git) :');
  for (const f of bad) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`✓ Aucun secret tracké (${files.length} fichiers indexés)`);
