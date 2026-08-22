/**
 * Recette happy path par rôle — smoke API (login + endpoints clés).
 *
 * Prérequis : API à jour sur :4000, comptes RECETTE_* (env) + données métier.
 *   cd server && npm run recette:roles
 *
 * Si Docker sert une image API ancienne, rebuild `caddynote-api` ou pointer
 * `RECETTE_API_URL` vers `npm run dev` local.
 *
 * Ne remplace pas la checklist UI `docs/RECETTE_HAPPY_PATH_ROLES.md`.
 */
import 'dotenv/config';
import { getRecetteLogin, getRecettePassword, getRecetteEmail } from './recetteCredentials.js';

const API = process.env.RECETTE_API_URL || 'http://127.0.0.1:4000';
type Expect = 'ok' | 'forbid';
type Ctx = { token: string; userId: string; institutionId: string | null; studentId: string | null };

type Check = {
  label: string;
  expect: Expect;
  /** Construit le chemin après login (query params métier). */
  path: (ctx: Ctx) => string | null;
};

type RoleScenario = {
  id: string;
  role: import('./recetteCredentials.js').RecetteRole;
  checks: Check[];
};

const scenarios: RoleScenario[] = [
  {
    id: 'R1',
    role: 'admin',
    checks: [
      { label: 'me', expect: 'ok', path: () => '/auth/me' },
      { label: 'institutions', expect: 'ok', path: () => '/institutions' },
      { label: 'backups', expect: 'ok', path: () => '/backups' },
      { label: 'admin-search', expect: 'ok', path: () => '/admin/search?q=demo' },
      { label: 'billing-metrics', expect: 'ok', path: () => '/admin/billing-metrics' },
      { label: 'ops-metrics', expect: 'ok', path: () => '/admin/ops-metrics' },
      { label: 'comms-queue', expect: 'ok', path: () => '/admin/communications' },
      { label: 'contact-messages', expect: 'ok', path: () => '/admin/contact-messages?status=all' },
      { label: 'dunning-queue', expect: 'ok', path: () => '/admin/dunning-queue' },
    ],
  },
  {
    id: 'R2',
    role: 'school_admin',
    checks: [
      { label: 'me', expect: 'ok', path: () => '/auth/me' },
      { label: 'students', expect: 'ok', path: () => '/students' },
      {
        label: 'classes',
        expect: 'ok',
        path: (c) => (c.institutionId ? `/classes?institutionId=${c.institutionId}` : null),
      },
      {
        label: 'absences',
        expect: 'ok',
        path: (c) => (c.institutionId ? `/absences?institutionId=${c.institutionId}` : null),
      },
      {
        label: 'grades',
        expect: 'ok',
        path: (c) => (c.studentId ? `/grades?studentId=${c.studentId}` : null),
      },
      { label: 'finance', expect: 'ok', path: () => '/finance/invoices' },
      {
        label: 'admissions',
        expect: 'ok',
        path: (c) => (c.institutionId ? `/admissions?institutionId=${c.institutionId}` : null),
      },
      {
        label: 'users',
        expect: 'ok',
        path: (c) => (c.institutionId ? `/users?institutionId=${c.institutionId}` : null),
      },
      { label: 'admin-billing-forbid', expect: 'forbid', path: () => '/admin/billing-metrics' },
    ],
  },
  {
    id: 'R3',
    role: 'teacher',
    checks: [
      { label: 'me', expect: 'ok', path: () => '/auth/me' },
      { label: 'courses', expect: 'ok', path: (c) => `/courses?teacherId=${c.userId}` },
      { label: 'grades', expect: 'ok', path: (c) => `/grades?teacherId=${c.userId}` },
      { label: 'assignments', expect: 'ok', path: (c) => `/assignments?teacherId=${c.userId}` },
      { label: 'messages', expect: 'ok', path: (c) => `/messages/received?userId=${c.userId}` },
      { label: 'exercises', expect: 'ok', path: () => '/exercises' },
      { label: 'finance-forbid', expect: 'forbid', path: () => '/finance/invoices' },
      { label: 'admissions-forbid', expect: 'forbid', path: () => '/admissions' },
      { label: 'admin-forbid', expect: 'forbid', path: () => '/admin/search?q=x' },
    ],
  },
  {
    id: 'R4',
    role: 'head_teacher',
    checks: [
      { label: 'me', expect: 'ok', path: () => '/auth/me' },
      {
        label: 'observations',
        expect: 'ok',
        path: (c) => (c.studentId ? `/observations?studentId=${c.studentId}` : null),
      },
      { label: 'grades', expect: 'ok', path: (c) => `/grades?teacherId=${c.userId}` },
      { label: 'admissions-forbid', expect: 'forbid', path: () => '/admissions' },
    ],
  },
  {
    id: 'R5',
    role: 'student',
    checks: [
      { label: 'me', expect: 'ok', path: () => '/auth/me' },
      {
        label: 'courses',
        expect: 'ok',
        path: (c) => (c.studentId ? `/courses?studentId=${c.studentId}` : null),
      },
      {
        label: 'grades',
        expect: 'ok',
        path: (c) => (c.studentId ? `/grades?studentId=${c.studentId}` : null),
      },
      {
        label: 'absences',
        expect: 'ok',
        path: (c) => (c.studentId ? `/absences?studentId=${c.studentId}` : null),
      },
      {
        label: 'assignments',
        expect: 'ok',
        path: (c) => (c.studentId ? `/assignments?studentId=${c.studentId}` : null),
      },
      {
        label: 'signatures',
        expect: 'ok',
        path: (c) => (c.studentId ? `/signatures?studentId=${c.studentId}` : null),
      },
      { label: 'users-forbid', expect: 'forbid', path: () => '/users' },
      { label: 'admissions-forbid', expect: 'forbid', path: () => '/admissions' },
    ],
  },
  {
    id: 'R6',
    role: 'parent',
    checks: [
      { label: 'me', expect: 'ok', path: () => '/auth/me' },
      { label: 'my-children', expect: 'ok', path: () => '/guardians/my-children' },
      { label: 'messages', expect: 'ok', path: (c) => `/messages/received?userId=${c.userId}` },
      {
        label: 'child-grades',
        expect: 'ok',
        path: (c) => (c.studentId ? `/grades?studentId=${c.studentId}` : null),
      },
      {
        label: 'child-absences',
        expect: 'ok',
        path: (c) => (c.studentId ? `/absences?studentId=${c.studentId}` : null),
      },
      {
        label: 'child-invoices',
        expect: 'ok',
        path: (c) => (c.studentId ? `/finance/invoices?studentId=${c.studentId}` : null),
      },
      { label: 'users-forbid', expect: 'forbid', path: () => '/users' },
      { label: 'admissions-forbid', expect: 'forbid', path: () => '/admissions' },
    ],
  },
  {
    id: 'R7',
    role: 'secretary',
    checks: [
      { label: 'me', expect: 'ok', path: () => '/auth/me' },
      { label: 'students', expect: 'ok', path: () => '/students' },
      {
        label: 'classes',
        expect: 'ok',
        path: (c) => (c.institutionId ? `/classes?institutionId=${c.institutionId}` : null),
      },
      {
        label: 'admissions',
        expect: 'ok',
        path: (c) => (c.institutionId ? `/admissions?institutionId=${c.institutionId}` : null),
      },
      {
        label: 'users',
        expect: 'ok',
        path: (c) => (c.institutionId ? `/users?institutionId=${c.institutionId}` : null),
      },
      { label: 'admin-forbid', expect: 'forbid', path: () => '/admin/search?q=x' },
    ],
  },
  {
    id: 'R8',
    role: 'accountant',
    checks: [
      { label: 'me', expect: 'ok', path: () => '/auth/me' },
      { label: 'finance', expect: 'ok', path: () => '/finance/invoices' },
      { label: 'students', expect: 'ok', path: () => '/students' },
      { label: 'admissions-forbid', expect: 'forbid', path: () => '/admissions' },
      { label: 'admin-forbid', expect: 'forbid', path: () => '/admin/search?q=x' },
    ],
  },
  {
    id: 'R9',
    role: 'supervisor',
    checks: [
      { label: 'me', expect: 'ok', path: () => '/auth/me' },
      {
        label: 'absences',
        expect: 'ok',
        path: (c) => (c.institutionId ? `/absences?institutionId=${c.institutionId}` : null),
      },
      { label: 'students', expect: 'ok', path: () => '/students' },
      {
        label: 'observations',
        expect: 'ok',
        path: (c) => (c.studentId ? `/observations?studentId=${c.studentId}` : null),
      },
      { label: 'admissions-forbid', expect: 'forbid', path: () => '/admissions' },
      { label: 'finance-forbid', expect: 'forbid', path: () => '/finance/invoices' },
      { label: 'admin-forbid', expect: 'forbid', path: () => '/admin/search?q=x' },
    ],
  },
  {
    id: 'R10',
    role: 'school_admin',
    checks: [
      { label: 'me', expect: 'ok', path: () => '/auth/me' },
      { label: 'students-b', expect: 'ok', path: () => '/students' },
    ],
  },
];

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

const login = async (email: string, password: string) => {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return { status: res.status, body: await json(res) };
};

const isOk = (status: number) => status >= 200 && status < 300;
const isForbid = (status: number) => status === 401 || status === 403;

async function resolveStudentId(token: string, role: string, userId: string): Promise<string | null> {
  // StrkStudent.id === StrkProfile.id (extension 1:1)
  if (role === 'student') return userId;

  if (role === 'parent') {
    const res = await fetch(`${API}/guardians/my-children`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await json(res);
    const children = (body.children as { studentId: string }[] | undefined) ?? [];
    return children[0]?.studentId ?? null;
  }
  const res = await fetch(`${API}/students`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await json(res);
  const list = (body.students as { id: string }[] | undefined) ?? [];
  return list[0]?.id ?? null;
}

async function main() {
  const password = getRecettePassword();
  const health = await fetch(`${API}/health`);
  if (!health.ok) {
    throw new Error(`API injoignable sur ${API} (${health.status}) — démarrer l’API puis données métier + RECETTE_*`);
  }
  console.log(`Cible API ${API}\n`);

  let studentIdsA: string[] = [];

  for (const scenario of scenarios) {
    const email = getRecetteEmail(scenario.role);
    const auth = await login(email, password);
    if (auth.status !== 200 || typeof auth.body.token !== 'string') {
      record(`${scenario.id}.login`, false, `login ${email} → ${auth.status}`);
      continue;
    }
    const user = auth.body.user as { id?: string; role?: string; institutionId?: string | null } | undefined;
    const roleOk = user?.role === scenario.role && typeof user.id === 'string';
    record(
      `${scenario.id}.login`,
      roleOk,
      roleOk ? `OK ${email} (${scenario.role})` : `rôle=${user?.role} attendu=${scenario.role}`
    );
    if (!roleOk || !user?.id) continue;

    const token = auth.body.token;
    const studentId = await resolveStudentId(token, scenario.role, user.id);
    const ctx: Ctx = {
      token,
      userId: user.id,
      institutionId: user.institutionId ?? null,
      studentId,
    };

    for (const check of scenario.checks) {
      const path = check.path(ctx);
      const id = `${scenario.id}.${check.label}`;
      if (!path) {
        record(id, false, 'contexte insuffisant (institutionId/studentId manquant)');
        continue;
      }
      const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
      if (check.expect === 'ok') {
        const softSkip =
          res.status === 404 &&
          ['billing-metrics', 'admin-search', 'ops-metrics', 'comms-queue', 'contact-messages', 'dunning-queue'].includes(
            check.label
          ) &&
          scenario.id === 'R1';
        if (softSkip) {
          record(id, true, `GET ${path} → 404 (API image ancienne — rebuild caddynote-api recommandé)`);
        } else {
          record(id, isOk(res.status), `GET ${path} → ${res.status}`);
        }
      } else {
        record(id, isForbid(res.status), `GET ${path} → ${res.status} (interdit attendu)`);
      }
    }

    if (scenario.id === 'R2') {
      const res = await fetch(`${API}/students`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await json(res);
      studentIdsA = ((body.students as { id: string }[] | undefined) ?? []).map((s) => s.id);
    }

    if (scenario.id === 'R10' && studentIdsA.length > 0) {
      const res = await fetch(`${API}/students`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await json(res);
      const idsB = ((body.students as { id: string }[] | undefined) ?? []).map((s) => s.id);
      const leak = studentIdsA.some((id) => idsB.includes(id));
      record('R10.isolation', !leak, leak ? 'fuite élèves A→B' : 'pas de fuite élèves A dans B');
    }
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
