/**
 * Recette locale — Lot 1 (socle, parent, isolation, sessions, MFA).
 *
 * Prérequis : API sur :4000, comptes seed (comptes RECETTE_* (env) + données métier).
 *   cd server && npx tsx scripts/recette-lot1.ts
 *
 * Ce n’est pas un substitut à la recette terrain : ça joue les scénarios
 * L1-1 à L1-4 contre l’API réelle du poste, avec les comptes démo.
 */
import 'dotenv/config';
import { getRecetteLogin, getRecettePassword, getRecetteEmail } from './recetteCredentials.js';
import { generateSync } from 'otplib';

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
  const body = await json(res);
  return { status: res.status, body };
};

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

async function main() {
  const health = await fetch(`${API}/health`);
  if (!health.ok) {
    throw new Error(`API injoignable sur ${API} (${health.status})`);
  }
  const healthBody = (await health.json()) as { databaseTarget?: { profile?: string } };
  console.log(`Cible API ${API} — profil DB : ${healthBody.databaseTarget?.profile ?? '?'}\n`);

  const dirA = await login(getRecetteEmail('school_admin'));
  if (dirA.status !== 200 || typeof dirA.body.token !== 'string') {
    record('L1-prep', false, `connexion direction A impossible (${dirA.status})`);
    process.exitCode = 1;
    return;
  }
  const tokenA = dirA.body.token;
  const instA = (dirA.body.user as { institutionId?: string } | undefined)?.institutionId;

  const dirB = await login(getRecetteEmail('school_admin'));
  if (dirB.status !== 200 || typeof dirB.body.token !== 'string') {
    record('L1-prep', false, `connexion direction B impossible (${dirB.status}) — relancer données métier + RECETTE_*`);
    process.exitCode = 1;
    return;
  }
  const tokenB = dirB.body.token;

  const studentsA = await fetch(`${API}/students`, { headers: authHeaders(tokenA) });
  const studentsABody = await json(studentsA);
  const listA = (studentsABody.students as { id: string }[] | undefined) ?? [];
  const studentA = listA[0];
  const classesUrl = instA ? `${API}/classes?institutionId=${instA}` : `${API}/classes`;
  const classesA = await fetch(classesUrl, { headers: authHeaders(tokenA) });
  const classesABody = await json(classesA);
  const classA = ((classesABody.classes as { id: string }[] | undefined) ?? [])[0];

  if (!studentA || !classA) {
    record('L1-prep', false, 'établissement A sans élève ou classe — relancer données métier + RECETTE_*');
    process.exitCode = 1;
    return;
  }

  // L1-1 isolation
  const listB = await fetch(`${API}/students`, { headers: authHeaders(tokenB) });
  const listBBody = await json(listB);
  const idsB = ((listBBody.students as { id: string }[] | undefined) ?? []).map((s) => s.id);
  const leak = idsB.includes(studentA.id);
  const ficheB = await fetch(`${API}/students/${studentA.id}`, { headers: authHeaders(tokenB) });
  const classeB = await fetch(`${API}/classes/${classA.id}`, { headers: authHeaders(tokenB) });
  const l1ok = listB.status === 200 && !leak && ficheB.status === 403 && classeB.status === 403;
  record(
    'L1-1',
    l1ok,
    l1ok
      ? 'B ne voit pas les élèves/classe de A ; fiches A → 403'
      : `liste leak=${leak} fiche=${ficheB.status} classe=${classeB.status}`
  );

  // L1-2 parent deux enfants
  const parent = await login(getRecetteEmail('parent'));
  if (parent.status !== 200 || typeof parent.body.token !== 'string') {
    record('L1-2', false, `connexion parent impossible (${parent.status})`);
  } else {
    const childrenRes = await fetch(`${API}/guardians/my-children`, {
      headers: authHeaders(parent.body.token),
    });
    const childrenBody = await json(childrenRes);
    const children = (childrenBody.children as { studentId: string; canViewGrades: boolean }[] | undefined) ?? [];
    const withGrades = children.find((c) => c.canViewGrades);
    const withoutGrades = children.find((c) => !c.canViewGrades);
    let gradesOk = false;
    let hiddenOk = false;
    if (withGrades) {
      const g = await fetch(`${API}/grades?studentId=${withGrades.studentId}`, {
        headers: authHeaders(parent.body.token),
      });
      gradesOk = g.status === 200;
    }
    if (withoutGrades) {
      const g = await fetch(`${API}/grades?studentId=${withoutGrades.studentId}`, {
        headers: authHeaders(parent.body.token),
      });
      hiddenOk = g.status === 403;
    }
    const l2ok = childrenRes.status === 200 && children.length >= 2 && gradesOk && hiddenOk;
    record(
      'L1-2',
      l2ok,
      l2ok
        ? `${children.length} enfants ; notes visibles / masquées selon le droit`
        : `enfants=${children.length} notes=${gradesOk} masquées=${hiddenOk}`
    );
  }

  // L1-3 sessions
  const t1 = await login(getRecetteEmail('teacher'));
  const t2 = await login(getRecetteEmail('teacher'));
  if (t1.status !== 200 || t2.status !== 200 || typeof t1.body.token !== 'string' || typeof t2.body.token !== 'string') {
    record('L1-3', false, `double connexion enseignant impossible (${t1.status}/${t2.status})`);
  } else {
    const sessionsRes = await fetch(`${API}/auth/sessions`, { headers: authHeaders(t1.body.token) });
    const sessionsBody = await json(sessionsRes);
    const sessions = (sessionsBody.sessions as { id: string; current?: boolean }[] | undefined) ?? [];
    const other = sessions.find((s) => !s.current);
    if (!other) {
      record('L1-3', false, 'pas de seconde session listée');
    } else {
      const revoke = await fetch(`${API}/auth/sessions/${other.id}`, {
        method: 'DELETE',
        headers: authHeaders(t1.body.token),
      });
      const asRevoked = await fetch(`${API}/auth/me`, { headers: authHeaders(t2.body.token) });
      const asKept = await fetch(`${API}/auth/me`, { headers: authHeaders(t1.body.token) });
      const l3ok = revoke.status === 200 && asRevoked.status === 401 && asKept.status === 200;
      record(
        'L1-3',
        l3ok,
        l3ok
          ? 'session distante révoquée ; celle-ci reste valide'
          : `revoke=${revoke.status} autre=${asRevoked.status} ici=${asKept.status}`
      );
    }
  }

  // L1-4 MFA — activation temporaire sur l’enseignant, puis désactivation
  // pour ne pas casser les connexions démo suivantes.
  let teacherToken = typeof t1.body.token === 'string' ? t1.body.token : '';
  if (teacherToken) {
    const still = await fetch(`${API}/auth/me`, { headers: authHeaders(teacherToken) });
    if (still.status !== 200) teacherToken = '';
  }
  if (!teacherToken) {
    const again = await login(getRecetteEmail('teacher'));
    teacherToken = typeof again.body.token === 'string' ? again.body.token : '';
  }
  if (!teacherToken) {
    record('L1-4', false, 'pas de jeton enseignant pour activer la MFA');
  } else {
    const setup = await fetch(`${API}/auth/mfa/setup`, {
      method: 'POST',
      headers: authHeaders(teacherToken),
    });
    const setupBody = await json(setup);
    const secret = setupBody.secret as string | undefined;
    if (setup.status !== 200 || !secret) {
      record('L1-4', false, `setup MFA ${setup.status}`);
    } else {
      const confirmCode = generateSync({ secret });
      const confirm = await fetch(`${API}/auth/mfa/confirm`, {
        method: 'POST',
        headers: { ...authHeaders(teacherToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: confirmCode }),
      });
      const challenge = await login(getRecetteEmail('teacher'));
      const challengeToken = challenge.body.challengeToken as string | undefined;
      const mfaAsked = challenge.status === 200 && challenge.body.mfaRequired === true && !!challengeToken;

      let wrongStatus = 0;
      let rightStatus = 0;
      let rightToken = '';
      if (mfaAsked && challengeToken) {
        const wrong = await fetch(`${API}/auth/mfa/login-verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challengeToken, code: '000000' }),
        });
        wrongStatus = wrong.status;
        const right = await fetch(`${API}/auth/mfa/login-verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challengeToken, code: generateSync({ secret }) }),
        });
        rightStatus = right.status;
        const rightBody = await json(right);
        rightToken = typeof rightBody.token === 'string' ? rightBody.token : '';
      }

      const l4ok = confirm.status === 200 && mfaAsked && wrongStatus === 401 && rightStatus === 200 && !!rightToken;
      record(
        'L1-4',
        l4ok,
        l4ok
          ? 'code faux refusé, code vrai → session'
          : `confirm=${confirm.status} mfaAsked=${mfaAsked} wrong=${wrongStatus} right=${rightStatus}`
      );

      const disableWith = rightToken || teacherToken;
      await fetch(`${API}/auth/mfa/disable`, {
        method: 'POST',
        headers: { ...authHeaders(disableWith), 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: PASSWORD }),
      });
    }
  }

  const failed = steps.filter((s) => !s.ok);
  console.log(`\nLot 1 : ${steps.filter((s) => s.ok).length}/${steps.length} pass`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
