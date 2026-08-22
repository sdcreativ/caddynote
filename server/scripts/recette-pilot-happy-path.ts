/**
 * Recette pilote P0 — parcours critiques sans rejouer tous les lots.
 *
 * Prérequis :
 *   - API sur :4000
 *   - `variables RECETTE_* && npm run seed:pilot`
 *
 *   cd server && npm run recette:pilot
 *
 * Valide : santé, comptes seed, effectifs genre, absences staff, notes élève,
 * préinscription publique → soumission → file staff.
 */
import 'dotenv/config';
import { getRecetteLogin, getRecettePassword, getRecetteEmail } from './recetteCredentials.js';

const API = process.env.RECETTE_API_URL || 'http://127.0.0.1:4000';
const PASSWORD = getRecettePassword();
const stamp = `${Date.now()}`;

type Step = { id: string; ok: boolean; detail: string };
const steps: Step[] = [];

const record = (id: string, ok: boolean, detail: string) => {
  steps.push({ id, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id} — ${detail}`);
};

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

const authHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

async function main() {
  console.log(`Recette pilote P0 — ${API}\n`);

  const health = await fetch(`${API}/health`);
  if (!health.ok) {
    throw new Error(`API injoignable (${health.status}) — démarrer l’API puis données métier + RECETTE_*`);
  }
  record('P0-health', true, `API OK`);

  const admin = await login(getRecetteEmail('admin'));
  const direction = await login(getRecetteEmail('school_admin'));
  const teacher = await login(getRecetteEmail('teacher'));
  const student = await login(getRecetteEmail('student'));
  const parent = await login(getRecetteEmail('parent'));

  const loginsOk =
    admin.status === 200 &&
    direction.status === 200 &&
    teacher.status === 200 &&
    student.status === 200 &&
    parent.status === 200;
  record(
    'P0-logins',
    loginsOk,
    loginsOk
      ? 'admin / direction / enseignant / élève / parent'
      : `admin=${admin.status} dir=${direction.status} ens=${teacher.status} elv=${student.status} par=${parent.status}`
  );
  if (!loginsOk) {
    process.exitCode = 1;
    return;
  }

  const adminToken = admin.body.token as string;
  const dirToken = direction.body.token as string;
  const studentToken = student.body.token as string;
  const studentId = (student.body.user as { id: string }).id;
  const institutionId = (direction.body.user as { institutionId?: string }).institutionId;
  if (!institutionId) {
    record('P0-inst', false, 'direction sans institutionId');
    process.exitCode = 1;
    return;
  }
  record('P0-inst', true, institutionId);

  // Diagnostics pilote (admin) — `pilot` nécessite une API à jour
  const diag = await fetch(`${API}/diagnostics`, { headers: authHeaders(adminToken) });
  const diagBody = await json(diag);
  const pilot = diagBody.pilot as { ready?: boolean; blockers?: string[]; warnings?: string[] } | undefined;
  const integrations = diagBody.integrations as unknown[] | undefined;
  const diagOk = diag.status === 200 && Array.isArray(integrations);
  record(
    'P0-diagnostics',
    diagOk,
    diagOk
      ? pilot
        ? `ready=${pilot.ready} blockers=${pilot.blockers?.length ?? 0} warnings=${pilot.warnings?.length ?? 0}`
        : `integrations=${integrations?.length ?? 0} (champ pilot absent — rebuild API)`
      : `HTTP ${diag.status}`
  );

  // Effectifs genre
  const studentsRes = await fetch(`${API}/students`, { headers: authHeaders(dirToken) });
  const studentsBody = await json(studentsRes);
  const gender = studentsBody.genderHeadcount as
    | { female?: number; male?: number; total?: number }
    | undefined;
  const genderOk =
    studentsRes.status === 200 &&
    (gender?.female ?? 0) >= 1 &&
    (gender?.male ?? 0) >= 1;
  record(
    'P0-gender',
    genderOk,
    genderOk
      ? `${gender?.female} fille(s) / ${gender?.male} garçon(s) (total ${gender?.total})`
      : `HTTP ${studentsRes.status} gender=${JSON.stringify(gender)}`
  );

  // Absences établissement
  const absRes = await fetch(
    `${API}/absences?institutionId=${encodeURIComponent(institutionId)}`,
    { headers: authHeaders(dirToken) }
  );
  const absBody = await json(absRes);
  const absences = (absBody.absences as unknown[]) ?? [];
  record(
    'P0-absences',
    absRes.status === 200 && absences.length >= 1,
    absRes.status === 200 ? `${absences.length} absence(s)` : `HTTP ${absRes.status}`
  );

  // Notes élève (publiées)
  const gradesRes = await fetch(`${API}/grades?studentId=${encodeURIComponent(studentId)}`, {
    headers: authHeaders(studentToken),
  });
  const gradesBody = await json(gradesRes);
  const grades = (gradesBody.grades as unknown[]) ?? [];
  record(
    'P0-grades',
    gradesRes.status === 200 && grades.length >= 1,
    gradesRes.status === 200 ? `${grades.length} note(s) visible(s)` : `HTTP ${gradesRes.status}`
  );

  // Préinscription publique → soumission
  const classesRes = await fetch(`${API}/admissions/institutions/${institutionId}/classes`);
  const classesBody = await json(classesRes);
  const classId = ((classesBody.classes as { id: string }[] | undefined) ?? [])[0]?.id;
  if (!classId) {
    record('P0-admission', false, 'aucune classe publique');
    process.exitCode = 1;
    summarize();
    return;
  }

  const contactEmail = `pilot.parent.${stamp}@admissions.test`;
  const createRes = await fetch(`${API}/admissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      institutionId,
      classId,
      academicYear: '2026-2027',
      applicationKind: 'pre_registration',
      studentFirstName: 'Aïcha',
      studentLastName: `Pilot${stamp}`,
      studentBirthDate: '2014-05-12',
      studentGender: 'female',
      guardians: [
        {
          firstName: 'Mariama',
          lastName: 'Sow',
          email: contactEmail,
          phone: '+221770000001',
          relationship: 'mother',
        },
      ],
      contactEmail,
    }),
  });
  const createBody = await json(createRes);
  const application = createBody.application as
    | { id?: string; publicToken?: string; status?: string; studentGender?: string }
    | undefined;
  const token = application?.publicToken;
  const createOk =
    createRes.status === 201 && !!token && application?.status === 'draft' && application?.studentGender === 'female';
  record(
    'P0-admission-create',
    createOk,
    createOk ? `draft token=${token?.slice(0, 8)}… gender=female` : `HTTP ${createRes.status}`
  );

  if (token) {
    const packetRes = await fetch(`${API}/admissions/status/${token}/packet`);
    const packetBody = await json(packetRes);
    const items = ((packetBody.packet as { items?: unknown[] } | undefined)?.items ??
      (packetBody.items as unknown[]) ??
      []) as unknown[];
    // Some APIs return { items } at top level via wrapper — tolerate both
    const itemCount =
      items.length ||
      ((packetBody as { items?: unknown[] }).items?.length ?? 0) ||
      (((packetBody as { packet?: { items?: unknown[] } }).packet?.items?.length) ?? 0);
    record(
      'P0-admission-packet',
      packetRes.status === 200,
      packetRes.status === 200 ? `packet HTTP 200 (items≈${itemCount})` : `HTTP ${packetRes.status}`
    );

    const submitRes = await fetch(`${API}/admissions/status/${token}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const submitBody = await json(submitRes);
    // 200 = soumis ; 400/422 = pièces obligatoires manquantes (flux bien câblé)
    const submitOk =
      submitRes.status === 200 ||
      submitRes.status === 400 ||
      submitRes.status === 422;
    record(
      'P0-admission-submit',
      submitOk,
      submitRes.status === 200
        ? 'dossier soumis'
        : `HTTP ${submitRes.status} — ${String(submitBody.error || submitBody.code || 'contrôle pièces actif')}`
    );
  }

  const listRes = await fetch(`${API}/admissions?institutionId=${encodeURIComponent(institutionId)}`, {
    headers: authHeaders(dirToken),
  });
  const listBody = await json(listRes);
  const apps = (listBody.applications as unknown[]) ?? [];
  record(
    'P0-admission-staff',
    listRes.status === 200 && apps.length >= 1,
    listRes.status === 200 ? `${apps.length} dossier(s) en file` : `HTTP ${listRes.status}`
  );

  // Anti-escalade register — exige API rebuildée avec canSelfAssignRole
  const escalate = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `hack.admin.${stamp}@example.invalid`,
      password: 'Password123!',
      firstName: 'Hack',
      lastName: 'Admin',
      role: 'admin',
    }),
  });
  const escalateBody = await json(escalate);
  record(
    'P0-register-lock',
    escalate.status === 403,
    escalate.status === 403
      ? 'admin public refusé'
      : `HTTP ${escalate.status} — rebuild caddynote-api pour activer le verrou (code=${String(escalateBody.code || '')})`
  );

  summarize();
}

function summarize() {
  const failed = steps.filter((s) => !s.ok);
  console.log(`\nPilote P0 : ${steps.filter((s) => s.ok).length}/${steps.length} pass`);
  if (failed.length) {
    console.error(`Échecs : ${failed.map((f) => f.id).join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log('Parcours critique OK — cocher ensuite la checklist UI (docs/RECETTE_TERRAIN.md).');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
