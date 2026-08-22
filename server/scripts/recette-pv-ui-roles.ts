/**
 * P1 — PV UI 4 rôles (API stand-in + checklist navigateur manuelle).
 *
 * Enchaîne les recettes R2 / R3 / R5 / R6 puis affiche la checklist browser.
 *
 * Prérequis : API up + comptes RECETTE_* (env) + données métier
 *
 *   cd server && npm run recette:pv-ui-roles
 *
 * Web optionnel : RECETTE_WEB_URL=http://127.0.0.1:9000
 */
import 'dotenv/config';
import { getRecetteLogin, getRecettePassword, getRecetteEmail } from './recetteCredentials.js';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const API = process.env.RECETTE_API_URL || 'http://127.0.0.1:4000';
const WEB = process.env.RECETTE_WEB_URL || 'http://127.0.0.1:9000';
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const recipes = [
  { id: 'R2', label: 'Direction / school_admin', npmScript: 'recette:school-admin-ui' },
  { id: 'R3', label: 'Enseignant', npmScript: 'recette:teacher-ui' },
  { id: 'R5', label: 'Élève', npmScript: 'recette:student-ui' },
  { id: 'R6', label: 'Parent', npmScript: 'recette:parent-ui' },
] as const;

const printChecklist = () => {
  console.log(`
════════════════════════════════════════════════════════════
PV UI 4 rôles — checklist navigateur (manuel)
URL : ${WEB}   · comptes RECETTE_* (env)
Détail : server/scripts/pv-ui-4-roles-checklist.md
════════════════════════════════════════════════════════════

R2 Direction (direction@recette.local)
  [ ] Login → dashboard KPI établissement
  [ ] Élèves : liste + fiche (genre, classe)
  [ ] Classes : créer / éditer (sans dead-end)
  [ ] Matières : créer + éditer + supprimer
  [ ] Absences : liste établissement non vide
  [ ] Admissions : file des dossiers
  [ ] Abonnement : page plans (retour ?checkout=)

R3 Enseignant (enseignant@recette.local)
  [ ] Login → classes / cours assignés
  [ ] Saisie notes (brouillon → publier)
  [ ] Présences / absences de sa classe
  [ ] Devoirs : créer / lister

R5 Élève (eleve@recette.local)
  [ ] Login → Mes notes (données réelles, pas mock)
  [ ] Emploi du temps / devoirs visibles
  [ ] Pas d’accès admin / finance

R6 Parent (parent@recette.local)
  [ ] Login → enfants liés
  [ ] Notes / absences de l’enfant
  [ ] Pas d’accès direction

Paiements sandbox (si clés configurées)
  [ ] CinetPay : suivi dossier → Payer Mobile Money → retour ?payment=success
  [ ] Stripe : Abonnement → Choisir plan → Checkout test → ?checkout=success

Signature PV : _______________  Date : _______________
`);
};

async function main() {
  console.log(`PV UI 4 rôles — API ${API} · web ${WEB}\n`);

  const health = await fetch(`${API}/health`);
  if (!health.ok) {
    throw new Error(`API injoignable sur ${API} (${health.status})`);
  }

  let failed = 0;
  for (const recipe of recipes) {
    console.log(`\n── ${recipe.id} ${recipe.label} ──`);
    const result = spawnSync('npm', ['run', recipe.npmScript], {
      cwd: serverRoot,
      env: { ...process.env, RECETTE_API_URL: API, RECETTE_WEB_URL: WEB },
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    if (result.status !== 0) {
      failed += 1;
      console.error(`FAIL  ${recipe.id} exit=${result.status}`);
    } else {
      console.log(`PASS  ${recipe.id} (API stand-in)`);
    }
  }

  printChecklist();

  if (failed > 0) {
    console.error(`${failed}/${recipes.length} recettes API en échec — corriger avant PV navigateur.`);
    process.exit(1);
  }
  console.log('Recettes API OK — cocher la checklist navigateur ci-dessus pour clôturer le PV.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
