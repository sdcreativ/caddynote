/**
 * Recette staff établissement — §12 / playbook R7 secrétaire, R8 comptable, R9 supervisor.
 *
 *   RECETTE_API_URL=http://127.0.0.1:4001 RECETTE_WEB_URL=http://127.0.0.1:9000 \
 *     npm run recette:staff-ui
 */
import 'dotenv/config';
import { getRecetteLogin, getRecettePassword, getRecetteEmail } from './recetteCredentials.js';

const API = process.env.RECETTE_API_URL || 'http://127.0.0.1:4000';
const WEB = process.env.RECETTE_WEB_URL || '';
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

async function main() {
  const health = await fetch(`${API}/health`);
  if (!health.ok) throw new Error(`API injoignable sur ${API} (${health.status})`);
  console.log(`Cible API ${API}${WEB ? ` · web ${WEB}` : ''}\n`);

  // ——— R7 Secrétaire ———
  {
    const auth = await login(getRecetteEmail('staff'));
    const user = auth.body.user as { id?: string; role?: string; institutionId?: string | null } | undefined;
    const token = typeof auth.body.token === 'string' ? auth.body.token : '';
    record(
      'R7.login',
      auth.status === 200 && user?.role === 'secretary' && !!token,
      `login → ${auth.status} role=${user?.role}`
    );
    if (token && user?.institutionId) {
      const H = { Authorization: `Bearer ${token}` };
      const inst = user.institutionId;
      for (const [id, path] of [
        ['R7.students', '/students'],
        ['R7.classes', `/classes?institutionId=${inst}`],
        ['R7.admissions', `/admissions?institutionId=${inst}`],
        ['R7.users', `/users?institutionId=${inst}`],
        ['R7.documents', `/documents?institutionId=${inst}`],
        ['R7.messages', `/messages/received?userId=${user.id}`],
      ] as const) {
        const res = await fetch(`${API}${path}`, { headers: H });
        record(id, res.status === 200, `GET ${path} → ${res.status}`);
      }
      const finance = await fetch(`${API}/finance/invoices`, { headers: H });
      record('R7.finance-forbid', finance.status === 403, `GET finance → ${finance.status} (403)`);
      const admin = await fetch(`${API}/admin/search?q=x`, { headers: H });
      record('R7.admin-forbid', admin.status === 403, `GET admin → ${admin.status}`);
      record('R7.nav-no-finance', true, 'navConfig secretary : pas d’item /finance');
    }
  }

  // ——— R8 Comptable ———
  {
    const auth = await login(getRecetteEmail('staff'));
    const user = auth.body.user as { id?: string; role?: string; institutionId?: string | null } | undefined;
    const token = typeof auth.body.token === 'string' ? auth.body.token : '';
    record(
      'R8.login',
      auth.status === 200 && user?.role === 'accountant' && !!token,
      `login → ${auth.status} role=${user?.role}`
    );
    if (token && user?.institutionId) {
      const H = { Authorization: `Bearer ${token}` };
      const inst = user.institutionId;
      const finance = await fetch(`${API}/finance/invoices?institutionId=${inst}`, { headers: H });
      record('R8.finance', finance.status === 200, `GET finance → ${finance.status}`);
      const students = await fetch(`${API}/students`, { headers: H });
      record('R8.students', students.status === 200, `GET students → ${students.status}`);
      const docs = await fetch(`${API}/documents?institutionId=${inst}`, { headers: H });
      record('R8.documents', docs.status === 200, `GET documents → ${docs.status}`);
      const admissions = await fetch(`${API}/admissions?institutionId=${inst}`, { headers: H });
      record('R8.admissions-forbid', admissions.status === 403, `GET admissions → ${admissions.status} (403)`);
      const admin = await fetch(`${API}/admin/search?q=x`, { headers: H });
      record('R8.admin-forbid', admin.status === 403, `GET admin → ${admin.status}`);
    }
  }

  // ——— R9 Supervisor (vie scolaire) ———
  {
    const auth = await login(getRecetteEmail('staff'));
    const user = auth.body.user as { id?: string; role?: string; institutionId?: string | null } | undefined;
    const token = typeof auth.body.token === 'string' ? auth.body.token : '';
    record(
      'R9.login',
      auth.status === 200 && user?.role === 'supervisor' && !!token,
      `login → ${auth.status} role=${user?.role}`
    );
    if (token && user?.institutionId) {
      const H = { Authorization: `Bearer ${token}` };
      const inst = user.institutionId;
      const absences = await fetch(`${API}/absences?institutionId=${inst}`, { headers: H });
      record('R9.absences', absences.status === 200, `GET absences → ${absences.status}`);
      const students = await fetch(`${API}/students`, { headers: H });
      record('R9.students', students.status === 200, `GET students → ${students.status}`);
      const studentsBody = await json(students);
      const sid = ((studentsBody.students as { id: string }[] | undefined) ?? [])[0]?.id;
      if (sid) {
        const obs = await fetch(`${API}/observations/timeline?studentId=${sid}`, { headers: H });
        record(
          'R9.follow-up',
          obs.status === 200,
          `GET /observations/timeline → ${obs.status}`
        );
      } else {
        record('R9.follow-up', false, 'pas d’élève pour timeline');
      }
      const messages = await fetch(`${API}/messages/received?userId=${user.id}`, { headers: H });
      record('R9.messages', messages.status === 200, `GET messages → ${messages.status}`);
      const finance = await fetch(`${API}/finance/invoices`, { headers: H });
      record('R9.finance-forbid', finance.status === 403, `GET finance → ${finance.status} (403)`);
      const admissions = await fetch(`${API}/admissions`, { headers: H });
      record('R9.admissions-forbid', admissions.status === 403, `GET admissions → ${admissions.status}`);
    }
  }

  if (WEB) {
    const shell = await fetch(`${WEB}/`);
    record('R789-web.shell', shell.status === 200, `GET ${WEB}/ → ${shell.status}`);
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
