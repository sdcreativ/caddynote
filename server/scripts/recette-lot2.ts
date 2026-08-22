/**
 * Recette locale — Lot 2 (préinscription publique → inscription).
 *
 * Prérequis : API sur :4000, comptes seed (comptes RECETTE_* (env) + données métier).
 *   cd server && npx tsx scripts/recette-lot2.ts
 */
import 'dotenv/config';
import { getRecetteLogin, getRecettePassword, getRecetteEmail } from './recetteCredentials.js';

const API = process.env.RECETTE_API_URL || 'http://127.0.0.1:4000';
const PASSWORD = getRecettePassword();

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

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

const stamp = `${Date.now()}`;

const deposit = async (institutionId: string, classId: string, overrides: Record<string, unknown> = {}) => {
  const payload = {
    institutionId,
    classId,
    academicYear: '2026-2027',
    studentFirstName: 'Fatou',
    studentLastName: `Recette${stamp}`,
    studentBirthDate: '2015-03-10',
    studentGender: 'female',
    guardians: [
      {
        firstName: 'Awa',
        lastName: 'Diop',
        email: `parent.recette.${stamp}@admissions.test`,
        phone: '+221700000000',
        relationship: 'mother',
      },
    ],
    contactEmail: `contact.recette.${stamp}@admissions.test`,
    ...overrides,
  };
  const res = await fetch(`${API}/admissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await json(res) };
};

async function main() {
  const health = await fetch(`${API}/health`);
  if (!health.ok) throw new Error(`API injoignable sur ${API} (${health.status})`);
  const healthBody = (await health.json()) as { databaseTarget?: { profile?: string } };
  console.log(`Cible API ${API} — profil DB : ${healthBody.databaseTarget?.profile ?? '?'}\n`);

  const dirA = await login(getRecetteEmail('school_admin'));
  if (dirA.status !== 200 || typeof dirA.body.token !== 'string') {
    record('L2-prep', false, `connexion direction A impossible (${dirA.status})`);
    process.exitCode = 1;
    return;
  }
  const tokenA = dirA.body.token;
  const instA = (dirA.body.user as { institutionId?: string } | undefined)?.institutionId;
  if (!instA) {
    record('L2-prep', false, 'direction A sans établissement');
    process.exitCode = 1;
    return;
  }

  const publicInst = await fetch(`${API}/admissions/institutions`);
  const publicInstBody = await json(publicInst);
  const institutions = (publicInstBody.institutions as { id: string }[] | undefined) ?? [];
  const classesRes = await fetch(`${API}/admissions/institutions/${instA}/classes`);
  const classesBody = await json(classesRes);
  const classA = ((classesBody.classes as { id: string }[] | undefined) ?? [])[0];
  if (publicInst.status !== 200 || !institutions.some((i) => i.id === instA) || !classA) {
    record('L2-prep', false, 'catalogue public établissements/classes incomplet');
    process.exitCode = 1;
    return;
  }

  // L2-1 — dépôt public, jeton de suivi, pas de compte
  const contactEmail = `contact.l21.${stamp}@admissions.test`;
  const created = await deposit(instA, classA.id, {
    studentLastName: `L21${stamp}`,
    contactEmail,
    guardians: [
      {
        firstName: 'Awa',
        lastName: 'Diop',
        email: `parent.l21.${stamp}@admissions.test`,
        relationship: 'mother',
      },
    ],
  });
  const app1 = created.body.application as { id?: string; publicToken?: string; status?: string; duplicateWarning?: unknown } | undefined;
  const token = app1?.publicToken;
  let statusPublic: Record<string, unknown> = {};
  if (token) {
    const statusRes = await fetch(`${API}/admissions/status/${token}`);
    statusPublic = await json(statusRes);
  }
  const publicApp = statusPublic.application as Record<string, unknown> | undefined;
  const loginGhost = await login(contactEmail);
  const l21ok =
    created.status === 201 &&
    app1?.status === 'draft' &&
    !!token &&
    publicApp?.status === 'draft' &&
    publicApp?.duplicateWarning === undefined &&
    loginGhost.status === 401;
  record(
    'L2-1',
    l21ok,
    l21ok
      ? 'dossier draft + jeton public ; aucun compte pour le contact'
      : `create=${created.status} token=${!!token} loginContact=${loginGhost.status}`
  );

  // L2-2 — doublon signalé au personnel, pas bloqué
  const twinName = { studentFirstName: 'Mamadou', studentLastName: `L22${stamp}`, studentBirthDate: '2016-01-01' };
  const firstTwin = await deposit(instA, classA.id, twinName);
  const secondTwin = await deposit(instA, classA.id, twinName);
  const secondId = (secondTwin.body.application as { id?: string } | undefined)?.id;
  const secondToken = (secondTwin.body.application as { publicToken?: string } | undefined)?.publicToken;
  let staffWarning: unknown;
  let publicHasWarning = false;
  if (secondId && typeof dirA.body.token === 'string') {
    const staff = await fetch(`${API}/admissions/${secondId}`, { headers: authHeaders(tokenA) });
    const staffBody = await json(staff);
    staffWarning = (staffBody.application as { duplicateWarning?: unknown } | undefined)?.duplicateWarning;
  }
  if (secondToken) {
    const pub = await fetch(`${API}/admissions/status/${secondToken}`);
    const pubBody = await json(pub);
    publicHasWarning = (pubBody.application as { duplicateWarning?: unknown } | undefined)?.duplicateWarning != null;
  }
  const l22ok =
    firstTwin.status === 201 &&
    secondTwin.status === 201 &&
    !!staffWarning &&
    !publicHasWarning;
  record(
    'L2-2',
    l22ok,
    l22ok
      ? 'second dépôt accepté ; doublon visible au personnel seulement'
      : `first=${firstTwin.status} second=${secondTwin.status} warning=${!!staffWarning} publicLeak=${publicHasWarning}`
  );

  // L2-3 — frais confirmés + enroll : matricule, parent réutilisé, certificat
  const createdEnroll = await deposit(instA, classA.id, {
    studentFirstName: 'Aminata',
    studentLastName: `L23${stamp}`,
    studentBirthDate: '2014-09-02',
    guardians: [
      {
        firstName: 'Jean',
        lastName: 'Koné',
        email: getRecetteEmail('parent'),
        relationship: 'father',
      },
    ],
    contactEmail: getRecetteEmail('parent'),
  });
  const enrollApp = createdEnroll.body.application as { id?: string; publicToken?: string } | undefined;
  if (!enrollApp?.id || !enrollApp.publicToken) {
    record('L2-3', false, `dépôt L2-3 impossible (${createdEnroll.status})`);
  } else {
    const submitted = await fetch(`${API}/admissions/status/${enrollApp.publicToken}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const fee = await fetch(`${API}/admissions/${enrollApp.id}/fee`, {
      method: 'POST',
      headers: { ...authHeaders(tokenA), 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationFeeCents: 15000 }),
    });
    const confirm = await fetch(`${API}/admissions/${enrollApp.id}/confirm-fee`, {
      method: 'POST',
      headers: authHeaders(tokenA),
    });
    const enroll = await fetch(`${API}/admissions/${enrollApp.id}/enroll`, {
      method: 'POST',
      headers: authHeaders(tokenA),
    });
    const enrollBody = await json(enroll);
    const studentNumber = enrollBody.studentNumber as string | undefined;
    const documentId = enrollBody.documentId as string | undefined;
    const guardians = (enrollBody.guardianAccounts as { email: string; created: boolean }[] | undefined) ?? [];
    const reused = guardians.some((g) => g.email === getRecetteEmail('parent') && g.created === false);

    let certOk = false;
    if (documentId) {
      const doc = await fetch(`${API}/documents/${documentId}`, { headers: authHeaders(tokenA) });
      const docBody = await json(doc);
      certOk = doc.status === 200 && (docBody.document as { type?: string } | undefined)?.type === 'enrollment_certificate';
    }

    const after = await fetch(`${API}/admissions/status/${enrollApp.publicToken}`);
    const afterBody = await json(after);
    const enrolledStatus = (afterBody.application as { status?: string } | undefined)?.status === 'enrolled';

    const l23ok =
      submitted.status === 200 &&
      fee.status === 200 &&
      confirm.status === 200 &&
      enroll.status === 201 &&
      !!studentNumber &&
      /^\d{4}-[0-9A-F]{6}$/.test(studentNumber) &&
      reused &&
      certOk &&
      enrolledStatus;
    record(
      'L2-3',
      l23ok,
      l23ok
        ? `inscrit ${studentNumber} ; parent réutilisé ; certificat émis`
        : `submit=${submitted.status} fee=${fee.status} confirm=${confirm.status} enroll=${enroll.status} reused=${reused} cert=${certOk}`
    );
  }

  const failed = steps.filter((s) => !s.ok);
  console.log(`\nLot 2 : ${steps.filter((s) => s.ok).length}/${steps.length} pass`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
