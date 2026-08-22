/**
 * Affiche la cible DATABASE_URL (sans mot de passe) avant migrate / seed /
 * studio. Refuse si CADDYNOTE_DB_PROFILE est posé et ne correspond pas.
 *
 * Usage : npx tsx scripts/which-db.ts
 */
import 'dotenv/config';
import {
  assertDbProfile,
  describeDatabaseTarget,
  getDatabaseTarget,
  hostDbMixupWarning,
} from '../src/lib/databaseTarget.js';

const target = getDatabaseTarget();
if (!target) {
  console.error('DATABASE_URL absent ou illisible — impossible de savoir quelle base sera touchée.');
  process.exit(1);
}

console.log(`Postgres cible : ${describeDatabaseTarget(target)}`);

const mismatch = assertDbProfile(target);
if (mismatch) {
  console.error(mismatch);
  process.exit(1);
}

const mixup = hostDbMixupWarning(target);
if (mixup) {
  console.warn(`⚠️  ${mixup}`);
}
