/**
 * Recette terrain — orchestrateur Lot 12.
 *
 * 1. Vérifie l’API + le flag `recetteTerrain` sur l’établissement pilote
 * 2. Enchaîne les recettes API (lots 1–8, 10, nfr)
 * 3. Écrit un procès-verbal JSON + Markdown
 * 4. Affiche la checklist UI restante (docs/RECETTE_TERRAIN.md)
 *
 *   cd server && npm run seed:pilot && npm run recette:terrain
 *
 * Variables :
 *   RECETTE_API_URL   (défaut http://127.0.0.1:4000)
 *   RECETTE_WEB_URL   (défaut http://127.0.0.1:8080) — smoke UI optionnel
 *   RECETTE_SKIP_LOTS=lot3,lot6  — sauter des lots
 *   RECETTE_WRITE_PV=0           — ne pas écrire le PV sur disque
 */
import 'dotenv/config';
import { getRecetteLogin, getRecettePassword, getRecetteEmail } from './recetteCredentials.js';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = process.env.RECETTE_API_URL || 'http://127.0.0.1:4000';
const WEB = process.env.RECETTE_WEB_URL || 'http://127.0.0.1:8080';
const FLAG = 'recetteTerrain';
const PASSWORD = getRecettePassword();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const serverDir = path.join(root, 'server');
const outDir = path.join(serverDir, 'recette-output');
const docsPvDir = path.join(root, 'docs', 'pv');

type LotResult = {
  lot: string;
  script: string;
  ok: boolean;
  exitCode: number | null;
  durationMs: number;
  detail: string;
};

type UiCheck = { id: string; role: string; path: string; action: string; expected: string };

const LOTS: { lot: string; script: string; label: string }[] = [
  { lot: '1', script: 'recette-lot1.ts', label: 'Socle / isolation / sessions / MFA' },
  { lot: '2', script: 'recette-lot2.ts', label: 'Préinscription' },
  { lot: '3', script: 'recette-lot3.ts', label: 'Vie scolaire' },
  { lot: '4', script: 'recette-lot4.ts', label: 'Pédagogie' },
  { lot: '5', script: 'recette-lot5.ts', label: 'Finance' },
  { lot: '6', script: 'recette-lot6.ts', label: 'Communication' },
  { lot: '7', script: 'recette-lot7.ts', label: 'Documents' },
  { lot: '8', script: 'recette-lot8.ts', label: 'Reporting' },
  { lot: '10', script: 'recette-lot10.ts', label: 'SaaS' },
  { lot: '11/12', script: 'recette-nfr.ts', label: 'NFR / audit dépendances' },
];

/** Parcours UI à cocher manuellement sur le pilote (NFR-A + smoke métier). */
const UI_CHECKS: UiCheck[] = [
  {
    id: 'UI-DIR-1',
    role: 'direction',
    path: '/sign → /dashboard',
    action: 'Connexion direction@… puis tableau de bord',
    expected: 'Shell établissement, KPIs visibles, pas d’erreur console bloquante',
  },
  {
    id: 'UI-DIR-2',
    role: 'direction',
    path: '/students',
    action: 'Ouvrir la liste élèves, fiche Léa Koné',
    expected: 'Données réelles seed, onglet Parcours / santé accessibles',
  },
  {
    id: 'UI-DIR-3',
    role: 'direction',
    path: '/admissions/admin',
    action: 'Ouvrir la file d’admission',
    expected: 'Page charge ; actions de transition visibles',
  },
  {
    id: 'UI-ENS-1',
    role: 'enseignant',
    path: '/attendance ou /teacher-attendance',
    action: 'Ouvrir l’appel, sélectionner un cours',
    expected: 'Effectif réel (pas de mock), saisie possible',
  },
  {
    id: 'UI-ENS-2',
    role: 'enseignant',
    path: '/grades',
    action: 'Créer une note brouillon puis publier',
    expected: 'Succès réel (pas de toast « ajoutée » sur échec)',
  },
  {
    id: 'UI-ELV-1',
    role: 'élève',
    path: '/my-courses',
    action: 'Voir Mes cours',
    expected: 'Mathématiques / Français (seed), pas de maquette figée',
  },
  {
    id: 'UI-ELV-2',
    role: 'élève',
    path: '/my-grades',
    action: 'Voir Mes notes',
    expected: 'Note publiée seed visible (pas de mock), empty state si aucune',
  },
  {
    id: 'UI-ELV-3',
    role: 'élève',
    path: 'Sidebar … → Déconnexion',
    action: 'Se déconnecter',
    expected: 'Retour /sign, session invalidée',
  },
  {
    id: 'UI-DIR-ABS',
    role: 'direction',
    path: '/absences',
    action: 'Ouvrir la liste absences établissement',
    expected: 'Au moins l’absence démo Léa (pas empty state trompeur)',
  },
  {
    id: 'UI-PAR-1',
    role: 'parent',
    path: '/my-children',
    action: 'Ouvrir Mes enfants',
    expected: 'Léa + Noah ; notes Noah masquées si droit absent',
  },
  {
    id: 'UI-A11Y-1',
    role: 'tous',
    path: '/sign, /aide, /my-children',
    action: 'Navigation clavier Tab / Entrée / Esc',
    expected: 'Focus visible, pas de piège clavier (NFR-A)',
  },
  {
    id: 'UI-A11Y-2',
    role: 'tous',
    path: 'Lighthouse (Chrome)',
    action: 'Audit Accessibilité + Contraste sur /sign et /dashboard',
    expected: 'Pas de régression critique contraste peint (NFR-008)',
  },
];

const skipSet = new Set(
  (process.env.RECETTE_SKIP_LOTS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

const json = async (res: Response) => {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
};

const login = async (email: string) => {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  return { status: res.status, body: await json(res) };
};

async function resolvePilot(): Promise<{ id: string; name: string; flagOn: boolean }> {
  const admin = await login(getRecetteEmail('admin'));
  if (admin.status !== 200 || typeof admin.body.token !== 'string') {
    throw new Error(`Login admin impossible (${admin.status}) — variables RECETTE_*`);
  }
  const token = admin.body.token as string;

  const dir = await login(getRecetteEmail('school_admin'));
  const instId =
    (dir.body.user as { institutionId?: string } | undefined)?.institutionId ||
    process.env.PILOT_INSTITUTION_ID;

  if (!instId) {
    throw new Error('institutionId direction introuvable — données métier + RECETTE_* puis seed:pilot');
  }

  const feat = await fetch(`${API}/institutions/${instId}/features`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const featBody = await json(feat);
  const effective = (featBody.effective as Record<string, boolean> | undefined) ?? {};

  const instRes = await fetch(`${API}/institutions/${instId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const instBody = await json(instRes);
  const institution = (instBody.institution as { name?: string } | undefined) ?? instBody;
  const displayName =
    (typeof institution.name === 'string' && institution.name) || 'établissement (PILOT_INSTITUTION_ID)';

  return { id: instId, name: displayName, flagOn: effective[FLAG] === true };
}

function runLot(script: string): LotResult {
  const lot = LOTS.find((l) => l.script === script)!;
  const started = Date.now();
  const result = spawnSync('npx', ['tsx', `scripts/${script}`], {
    cwd: serverDir,
    encoding: 'utf8',
    env: { ...process.env, RECETTE_API_URL: API },
  });
  const durationMs = Date.now() - started;
  const ok = result.status === 0;
  const tail = (result.stdout || result.stderr || '')
    .trim()
    .split('\n')
    .slice(-3)
    .join(' | ');
  return {
    lot: lot.lot,
    script,
    ok,
    exitCode: result.status,
    durationMs,
    detail: ok ? `Pass (${durationMs} ms) — ${tail}` : `Fail exit=${result.status} — ${tail}`,
  };
}

async function smokeWeb(): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(WEB, { redirect: 'manual' });
    if (res.status >= 200 && res.status < 500) {
      return { ok: true, detail: `UI joignable sur ${WEB} (HTTP ${res.status})` };
    }
    return { ok: false, detail: `UI HTTP ${res.status} sur ${WEB}` };
  } catch (err) {
    return {
      ok: false,
      detail: `UI injoignable sur ${WEB} — checklist manuelle docs/RECETTE_TERRAIN.md (${(err as Error).message})`,
    };
  }
}

function writePv(payload: {
  date: string;
  api: string;
  pilot: { id: string; name: string; flagOn: boolean };
  lots: LotResult[];
  web: { ok: boolean; detail: string };
}) {
  if (process.env.RECETTE_WRITE_PV === '0') return;

  mkdirSync(outDir, { recursive: true });
  mkdirSync(docsPvDir, { recursive: true });

  const jsonPath = path.join(outDir, 'pv-latest.json');
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf8');

  const passCount = payload.lots.filter((l) => l.ok).length;
  const mdLines = [
    `# Procès-verbal recette terrain`,
    ``,
    `| Champ | Valeur |`,
    `|---|---|`,
    `| Date | ${payload.date} |`,
    `| API | ${payload.api} |`,
    `| Établissement pilote | ${payload.pilot.name} (\`${payload.pilot.id}\`) |`,
    `| Flag \`${FLAG}\` | ${payload.pilot.flagOn ? 'actif' : 'inactif — relancer seed:pilot'} |`,
    `| Lots API | ${passCount}/${payload.lots.length} pass |`,
    `| Smoke UI | ${payload.web.ok ? 'Pass' : 'Non joué / fail'} — ${payload.web.detail} |`,
    ``,
    `## Lots API`,
    ``,
    `| Lot | Résultat | Détail |`,
    `|---|---|---|`,
    ...payload.lots.map(
      (l) => `| ${l.lot} | ${l.ok ? 'Pass' : 'Fail'} | ${l.detail.replace(/\|/g, '/')} |`
    ),
    ``,
    `## Checklist UI (à cocher sur le pilote)`,
    ``,
    `| # | Rôle | Parcours | Statut |`,
    `|---|---|---|---|`,
    ...UI_CHECKS.map((c) => `| ${c.id} | ${c.role} | ${c.path} — ${c.action} | ☐ |`),
    ``,
    `Playbook détaillé : [RECETTE_TERRAIN.md](../RECETTE_TERRAIN.md)`,
    ``,
  ];

  const mdPath = path.join(docsPvDir, `RECETTE_PV_${payload.date}.md`);
  writeFileSync(mdPath, mdLines.join('\n'), 'utf8');
  writeFileSync(path.join(outDir, 'pv-latest.md'), mdLines.join('\n'), 'utf8');

  console.log(`\nPV écrit :`);
  console.log(`  ${jsonPath}`);
  console.log(`  ${mdPath}`);
}

async function main() {
  const health = await fetch(`${API}/health`);
  if (!health.ok) {
    throw new Error(`API injoignable sur ${API} (${health.status})`);
  }
  const healthBody = (await health.json()) as { databaseTarget?: { profile?: string } };
  console.log(`Recette terrain — API ${API} (DB ${healthBody.databaseTarget?.profile ?? '?'})\n`);

  // S’assurer que le pilote est désigné (best-effort).
  if (existsSync(path.join(serverDir, 'scripts/seed-pilot.ts'))) {
    try {
      execFileSync('npx', ['tsx', 'scripts/seed-pilot.ts'], {
        cwd: serverDir,
        encoding: 'utf8',
        stdio: 'inherit',
      });
    } catch {
      console.warn('seed:pilot a échoué — poursuite avec l’état courant\n');
    }
  }

  const pilot = await resolvePilot();
  console.log(`Pilote : ${pilot.name} (${pilot.id}) — ${FLAG}=${pilot.flagOn}\n`);
  if (!pilot.flagOn) {
    console.warn(`Attention : flag ${FLAG} inactif. Relancer npm run seed:pilot.\n`);
  }

  const lots: LotResult[] = [];
  for (const entry of LOTS) {
    const skipKey = `lot${entry.lot}`.toLowerCase();
    if (skipSet.has(skipKey) || skipSet.has(entry.lot.toLowerCase()) || skipSet.has(entry.script)) {
      lots.push({
        lot: entry.lot,
        script: entry.script,
        ok: true,
        exitCode: null,
        durationMs: 0,
        detail: `SKIP (${process.env.RECETTE_SKIP_LOTS})`,
      });
      console.log(`SKIP  Lot ${entry.lot} — ${entry.label}`);
      continue;
    }
    console.log(`\n===== Lot ${entry.lot} — ${entry.label} =====`);
    const result = runLot(entry.script);
    lots.push(result);
    console.log(`${result.ok ? 'PASS' : 'FAIL'}  Lot ${entry.lot} — ${result.detail}`);
    if (!result.ok) {
      // Continuer pour avoir un PV complet, mais exit != 0 à la fin.
    }
  }

  const web = await smokeWeb();
  console.log(`\n${web.ok ? 'PASS' : 'SKIP'}  UI-SMOKE — ${web.detail}`);

  const date = new Date().toISOString().slice(0, 10);
  writePv({ date, api: API, pilot, lots, web });

  console.log('\n--- Checklist UI restante (cocher dans docs/RECETTE_TERRAIN.md) ---');
  for (const c of UI_CHECKS) {
    console.log(`☐ ${c.id} [${c.role}] ${c.path}`);
  }

  const failed = lots.filter((l) => !l.ok);
  console.log(`\nTerrain API : ${lots.filter((l) => l.ok).length}/${lots.length} lots pass`);
  if (failed.length > 0) {
    console.error(`Échecs : ${failed.map((f) => f.lot).join(', ')}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
