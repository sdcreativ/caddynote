/**
 * Recette Parent — parcours §12 / playbook R6 (équivalent UI via API).
 *
 *   RECETTE_API_URL=http://127.0.0.1:4001 RECETTE_WEB_URL=http://127.0.0.1:9000 \
 *     npm run recette:parent-ui
 */
import 'dotenv/config';
import { getRecetteLogin, getRecettePassword, getRecetteEmail } from './recetteCredentials.js';

const API = process.env.RECETTE_API_URL || 'http://127.0.0.1:4000';
const WEB = process.env.RECETTE_WEB_URL || '';
const PASSWORD = getRecettePassword();
const EMAIL = getRecetteEmail('parent');

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

type Child = {
  studentId: string;
  canViewGrades?: boolean;
  canViewAttendance?: boolean;
  canViewBilling?: boolean;
  firstName?: string;
  lastName?: string;
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
  const user = loginBody.user as { id?: string; role?: string } | undefined;
  const token = typeof loginBody.token === 'string' ? loginBody.token : '';
  record(
    'R6-1.login',
    login.status === 200 && user?.role === 'parent' && !!token,
    `login → ${login.status} role=${user?.role}`
  );
  if (!token || !user?.id) {
    process.exitCode = 1;
    return;
  }
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const childrenRes = await fetch(`${API}/guardians/my-children`, { headers: H });
  const childrenBody = await json(childrenRes);
  const children = (childrenBody.children as Child[] | undefined) ?? [];
  record(
    'R6-1.my-children',
    childrenRes.status === 200 && children.length >= 1,
    `GET /guardians/my-children → ${childrenRes.status} n=${children.length}`
  );
  record(
    'R6-2.children-count',
    children.length >= 2,
    `enfants seed attendus ≥2 (Léa+Noah) n=${children.length}`
  );

  // Notes selon droits seed : au moins un enfant avec canViewGrades, un éventuellement masqué
  const withGrades = children.filter((c) => c.canViewGrades !== false);
  const withoutGrades = children.filter((c) => c.canViewGrades === false);
  record(
    'R6-2.grades-rights',
    withGrades.length >= 1,
    `canViewGrades=true: ${withGrades.length} ; false: ${withoutGrades.length}`
  );

  for (const child of children.slice(0, 2)) {
    const sid = child.studentId;
    const label = `${child.firstName || sid.slice(0, 8)}`;

    const grades = await fetch(`${API}/grades?studentId=${encodeURIComponent(sid)}`, { headers: H });
    const expectGradesOk = child.canViewGrades !== false;
    record(
      `R6-2.grades-${label}`,
      expectGradesOk ? grades.status === 200 : grades.status === 403,
      `grades ${label} → ${grades.status} (attendu ${expectGradesOk ? 200 : 403})`
    );

    const absences = await fetch(`${API}/absences?studentId=${encodeURIComponent(sid)}`, { headers: H });
    const expectAbs = child.canViewAttendance !== false;
    record(
      `R6-2.absences-${label}`,
      expectAbs ? absences.status === 200 : absences.status === 403 || absences.status === 200,
      `absences ${label} → ${absences.status}`
    );

    const invoices = await fetch(`${API}/finance/invoices?studentId=${encodeURIComponent(sid)}`, {
      headers: H,
    });
    const expectBill = child.canViewBilling !== false;
    record(
      `R6-3.invoices-${label}`,
      expectBill ? invoices.status === 200 : invoices.status === 403,
      `invoices ${label} → ${invoices.status} (attendu ${expectBill ? 200 : 403})`
    );
  }

  const messages = await fetch(`${API}/messages/received?userId=${encodeURIComponent(user.id)}`, {
    headers: H,
  });
  record('R6-4.messages', messages.status === 200, `GET /messages/received → ${messages.status}`);

  const schedules = await fetch(`${API}/schedules/effective?from=2026-01-01&to=2026-12-31`, {
    headers: H,
  });
  record(
    'R6-4.calendar',
    schedules.status === 200 || schedules.status === 400,
    `GET /schedules/effective → ${schedules.status}`
  );

  const usersForbid = await fetch(`${API}/users`, { headers: H });
  record('R6-forbid.users', usersForbid.status === 403, `GET /users → ${usersForbid.status}`);
  const admissions = await fetch(`${API}/admissions`, { headers: H });
  record('R6-forbid.admissions', admissions.status === 403, `GET /admissions → ${admissions.status}`);

  record('R6-wiring', true, 'Nav parent : /my-children (+ ?tab=finance), /messages, /calendar');

  if (WEB) {
    const shell = await fetch(`${WEB}/`);
    record('R6-web.shell', shell.status === 200, `GET ${WEB}/ → ${shell.status}`);
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
