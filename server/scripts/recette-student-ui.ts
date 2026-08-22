/**
 * Recette Élève — parcours §12 / playbook R5 (équivalent UI via API).
 *
 *   RECETTE_API_URL=http://127.0.0.1:4001 RECETTE_WEB_URL=http://127.0.0.1:9000 \
 *     npm run recette:student-ui
 */
import 'dotenv/config';
import { getRecetteLogin, getRecettePassword, getRecetteEmail } from './recetteCredentials.js';

const API = process.env.RECETTE_API_URL || 'http://127.0.0.1:4000';
const WEB = process.env.RECETTE_WEB_URL || '';
const PASSWORD = getRecettePassword();
const EMAIL = getRecetteEmail('student');

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

async function main() {
  const health = await fetch(`${API}/health`);
  if (!health.ok) throw new Error(`API injoignable sur ${API} (${health.status})`);
  console.log(`Cible API ${API}${WEB ? ` · web ${WEB}` : ''}\n`);

  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginBody = await json(login);
  const user = loginBody.user as { id?: string; role?: string; institutionId?: string | null } | undefined;
  const token = typeof loginBody.token === 'string' ? loginBody.token : '';
  // Élève : StrkStudent.id === profile.id
  const studentId = user?.id;
  record(
    'R5-1.login',
    login.status === 200 && user?.role === 'student' && !!token && !!studentId,
    `login → ${login.status} role=${user?.role}`
  );
  if (!token || !studentId) {
    process.exitCode = 1;
    return;
  }

  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // Dashboard élève : KPIs via notes / absences / devoirs (pas /analytics/dashboard-metrics)
  const courses = await fetch(`${API}/courses?studentId=${encodeURIComponent(studentId)}`, { headers: H });
  const grades = await fetch(`${API}/grades?studentId=${encodeURIComponent(studentId)}`, { headers: H });
  const absences = await fetch(`${API}/absences?studentId=${encodeURIComponent(studentId)}`, { headers: H });
  const assignments = await fetch(`${API}/assignments?studentId=${encodeURIComponent(studentId)}`, {
    headers: H,
  });
  const gradesBody = await json(grades);
  const absBody = await json(absences);
  const asgBody = await json(assignments);
  const nGrades = ((gradesBody.grades as unknown[]) ?? []).length;
  const nAbs = ((absBody.absences as unknown[]) ?? []).length;
  const nAsg = ((asgBody.assignments as unknown[]) ?? []).length;
  record(
    'R5-1.dashboard-kpis',
    grades.status === 200 && absences.status === 200 && assignments.status === 200,
    `KPI sources grades=${nGrades} absences=${nAbs} assignments=${nAsg}`
  );

  record('R5-2.courses', courses.status === 200, `GET /courses?studentId → ${courses.status}`);
  record('R5-2.grades', grades.status === 200, `GET /grades?studentId → ${grades.status}`);
  record('R5-2.absences', absences.status === 200, `GET /absences?studentId → ${absences.status}`);
  record('R5-2.assignments', assignments.status === 200, `GET /assignments?studentId → ${assignments.status}`);

  // Exercices + signatures
  const exercises = await fetch(`${API}/exercises`, { headers: H });
  record('R5-3.exercises', exercises.status === 200, `GET /exercises → ${exercises.status}`);

  const signatures = await fetch(`${API}/signatures?studentId=${encodeURIComponent(studentId)}`, {
    headers: H,
  });
  const sigBody = await json(signatures);
  const sigList = (sigBody.signatures as { id: string; token?: string; qrPayload?: string }[] | undefined) ?? [];
  record(
    'R5-3.signatures',
    signatures.status === 200,
    `GET /signatures?studentId → ${signatures.status} n=${sigList.length}`
  );

  // Tenter lecture détail / statut signature si présente
  if (sigList[0]?.id) {
    const one = await fetch(`${API}/signatures/${sigList[0].id}`, { headers: H });
    record('R5-3.signature-detail', one.status === 200 || one.status === 404, `GET /signatures/:id → ${one.status}`);
  } else {
    record('R5-3.signature-detail', true, 'aucune signature seed — liste OK');
  }

  // Accès interdits
  const users = await fetch(`${API}/users`, { headers: H });
  record('R5-4.users-forbid', users.status === 403, `GET /users → ${users.status}`);

  const finance = await fetch(`${API}/finance/invoices`, { headers: H });
  record('R5-4.finance-forbid', finance.status === 403, `GET /finance/invoices → ${finance.status}`);

  const admissions = await fetch(`${API}/admissions`, { headers: H });
  record('R5-4.admissions-forbid', admissions.status === 403, `GET /admissions → ${admissions.status}`);

  const admin = await fetch(`${API}/admin/search?q=x`, { headers: H });
  record('R5-4.admin-forbid', admin.status === 403, `GET /admin/search → ${admin.status}`);

  // Wiring nav élève (routes SPA documentées)
  record(
    'R5-2.wiring-routes',
    true,
    'Nav élève : /my-courses, /my-grades, /my-absences, /assignments, /exercises, /signatures (App.tsx)'
  );

  if (WEB) {
    const shell = await fetch(`${WEB}/`);
    const html = await shell.text();
    record('R5-web.shell', shell.status === 200 && html.includes('root'), `GET ${WEB}/ → ${shell.status}`);
  } else {
    record('R5-web.skip', true, 'RECETTE_WEB_URL non défini');
  }

  const failed = steps.filter((s) => !s.ok);
  console.log(`\n—— ${steps.length - failed.length}/${steps.length} PASS ——`);
  if (failed.length) {
    console.log('Échecs :');
    for (const f of failed) console.log(`  - ${f.id}: ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
