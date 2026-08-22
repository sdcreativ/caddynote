import { getRecetteLogin, getRecettePassword, getRecetteEmail } from './recetteCredentials.js';
/**
 * Recette session MFA Admin — hors CADDYNOTE_TEST_MODE (preuve gate + checklist UI).
 *
 * Preuve automatisée : déléguée à `mfaRequired.test.ts`
 *   (admin plateforme bloqué sans MFA en prod simulée).
 *
 * Session navigateur (humaine) : voir docs/RECETTE_HAPPY_PATH_ROLES.md § R1-MFA.
 *
 *   cd server && npm run recette:admin-mfa
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

console.log(`
═══ Recette Admin MFA (hors TEST_MODE) ═══

1) Preuve HTTP (vitest) — admin sans MFA → 403 mfa_setup_required
2) Checklist navigateur — § R1-MFA dans RECETTE_HAPPY_PATH_ROLES.md

Lancement des tests MFA…
`);

const result = spawnSync(
  'npx',
  ['vitest', 'run', 'src/__tests__/mfaRequired.test.ts'],
  {
    cwd: serverDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      TEST_DATABASE_URL:
        process.env.TEST_DATABASE_URL ||
        'postgresql://caddynote:caddynote@127.0.0.1:5433/caddynote_test',
    },
  }
);

if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
} else {
  console.log(`
✓ Gate MFA admin prouvée (HTTP).

Session navigateur (optionnelle, humaine) :
  1. Arrêter l’API en TEST_MODE ; démarrer avec CADDYNOTE_TEST_MODE=false NODE_ENV=production
  2. Compte admin@recette.local sans MFA → /admin-login → enrôlement TOTP obligatoire
  3. Avec MFA : challenge TOTP / code de secours → /super-admin/overview
  4. Cocher R1-MFA dans le playbook

Détail : docs/RECETTE_HAPPY_PATH_ROLES.md § R1-MFA
`);
}
