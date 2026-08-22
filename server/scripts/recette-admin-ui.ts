/**
 * Recette Admin plateforme — parcours §12 / playbook R1 (équivalent UI via API).
 *
 * Couvre les actions Super Admin sans navigateur :
 *   login → overview ops → impersonate enseignant → exit →
 *   sync-stripe (DB only OK) → backups verify/download-url → file comms.
 *
 * Prérequis : seed demo + API joignable.
 *   cd server && variables RECETTE_*
 *   RECETTE_API_URL=http://127.0.0.1:4000 npm run recette:admin-ui
 *
 * Optionnel UI shell : RECETTE_WEB_URL=http://127.0.0.1:9000 (smoke HTML).
 */
import 'dotenv/config';
import { getRecetteLogin, getRecettePassword, getRecetteEmail } from './recetteCredentials.js';

const API = process.env.RECETTE_API_URL || 'http://127.0.0.1:4000';
const WEB = process.env.RECETTE_WEB_URL || '';
const PASSWORD = getRecettePassword();
const ADMIN = getRecetteEmail('admin');
const TEACHER = getRecetteEmail('teacher');

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
  if (!health.ok) {
    throw new Error(`API injoignable sur ${API} (${health.status})`);
  }
  console.log(`Cible API ${API}${WEB ? ` · web ${WEB}` : ''}\n`);

  // R1-1 — Login admin (MFA assouplie en TEST_MODE)
  const auth = await login(ADMIN);
  const adminUser = auth.body.user as { id?: string; role?: string } | undefined;
  const adminToken = typeof auth.body.token === 'string' ? auth.body.token : '';
  record(
    'R1-1.login',
    auth.status === 200 && adminUser?.role === 'admin' && !!adminToken,
    `login ${ADMIN} → ${auth.status} role=${adminUser?.role}`
  );
  if (!adminToken) {
    process.exitCode = 1;
    return;
  }
  const H = { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' };

  // Overview / ops surfaces (alimentent Super Admin)
  for (const [id, path] of [
    ['R1-1.overview-institutions', '/institutions'],
    ['R1-1.ops-metrics', '/admin/ops-metrics'],
    ['R1-1.billing-metrics', '/admin/billing-metrics'],
    ['R1-1.search', '/admin/search?q=enseignant'],
  ] as const) {
    const res = await fetch(`${API}${path}`, { headers: H });
    record(id, res.status >= 200 && res.status < 300, `GET ${path} → ${res.status}`);
  }

  // R1-2 / R1-3 — Impersonation enseignant → exit
  const teachLogin = await login(TEACHER);
  const teacherId = (teachLogin.body.user as { id?: string } | undefined)?.id;
  record('R1-2.resolve-teacher', !!teacherId, teacherId ? `teacherId=${teacherId}` : 'enseignant introuvable');

  if (teacherId) {
    const imp = await fetch(`${API}/admin/impersonate`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        userId: teacherId,
        durationMinutes: 15,
        reason: 'Recette §12 Admin UI terrain — impersonation test',
      }),
    });
    const impBody = await json(imp);
    const impToken = typeof impBody.token === 'string' ? impBody.token : '';
    const impUser = impBody.user as { role?: string } | undefined;
    record(
      'R1-2.impersonate',
      imp.status === 200 && impUser?.role === 'teacher' && !!impToken,
      `POST /admin/impersonate → ${imp.status} role=${impUser?.role}`
    );

    if (impToken) {
      const me = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${impToken}` } });
      const meBody = await json(me);
      const meUser = meBody.user as { role?: string; impersonatorId?: string } | undefined;
      // /auth/me may nest differently — also accept top-level
      const role = meUser?.role ?? (meBody.role as string | undefined);
      record('R1-2.me-as-teacher', me.status === 200 && role === 'teacher', `GET /auth/me → ${me.status} role=${role}`);

      const exit = await fetch(`${API}/admin/impersonate/exit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${impToken}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
      const exitBody = await json(exit);
      const exitUser = exitBody.user as { role?: string } | undefined;
      const exitToken = typeof exitBody.token === 'string' ? exitBody.token : '';
      record(
        'R1-3.exit',
        exit.status === 200 && exitUser?.role === 'admin' && !!exitToken,
        `POST /admin/impersonate/exit → ${exit.status} role=${exitUser?.role}`
      );
    }
  }

  // R1-4 — Sync Stripe / badge DB only
  const subs = await fetch(`${API}/subscriptions/all`, { headers: H });
  const subsBody = await json(subs);
  const list = (subsBody.subscriptions as { id: string; stripeSubscriptionId?: string | null }[] | undefined) ?? [];
  record('R1-4.list-subs', subs.status === 200, `GET /subscriptions/all → ${subs.status} n=${list.length}`);
  if (list[0]?.id) {
    const sync = await fetch(`${API}/subscriptions/${list[0].id}/admin/sync-stripe`, {
      method: 'POST',
      headers: H,
      body: '{}',
    });
    // 200 = syncé ; 422 = DB only explicite ; 501 = Stripe non configuré
    const ok = sync.status === 200 || sync.status === 422 || sync.status === 501;
    record('R1-4.sync-stripe', ok, `POST sync-stripe → ${sync.status} (200/422/501 attendus)`);
  } else {
    record('R1-4.sync-stripe', true, 'aucun abo — skip (seed sans subscription OK)');
  }

  // R1-5 — Backup verify + download URL
  const backups = await fetch(`${API}/backups`, { headers: H });
  const backupsBody = await json(backups);
  record('R1-5.list-backups', backups.status === 200, `GET /backups → ${backups.status}`);

  const verify = await fetch(`${API}/backups/verify`, {
    method: 'POST',
    headers: H,
    body: '{}',
  });
  // 200 OK, 400 besoin clé, 501 S3 absent — tous acceptables pour la recette
  record(
    'R1-5.verify',
    [200, 400, 404, 501].includes(verify.status),
    `POST /backups/verify → ${verify.status}`
  );

  const dl = await fetch(`${API}/backups/download-url`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({}),
  });
  record(
    'R1-5.download-url',
    [200, 400, 404, 501].includes(dl.status),
    `POST /backups/download-url → ${dl.status}`
  );

  // R1-6 — File comms + retry
  const comms = await fetch(`${API}/admin/communications?status=failed`, { headers: H });
  const commsBody = await json(comms);
  const logs = (commsBody.logs as { id: string }[] | undefined) ?? [];
  record('R1-6.comms-queue', comms.status === 200, `GET /admin/communications → ${comms.status} failed=${logs.length}`);
  if (logs[0]?.id) {
    const retry = await fetch(`${API}/admin/communications/${logs[0].id}/retry`, {
      method: 'POST',
      headers: H,
      body: '{}',
    });
    record('R1-6.retry', retry.status >= 200 && retry.status < 300, `POST retry → ${retry.status}`);
  } else {
    record('R1-6.retry', true, 'file vide — endpoint listé OK (rien à relancer)');
  }

  // R1-7 — redirect legacy (vérif côté front via HTML / code ; smoke web optionnel)
  if (WEB) {
    for (const [id, path, expect] of [
      ['R1-7.admin-login', '/admin-login', 200],
      ['R1-7.web-root', '/', 200],
    ] as const) {
      const res = await fetch(`${WEB}${path}`, { redirect: 'manual' });
      record(id, res.status === expect || (res.status >= 300 && res.status < 400), `GET ${WEB}${path} → ${res.status}`);
    }
  } else {
    record('R1-7.web-smoke', true, 'RECETTE_WEB_URL non défini — skip shell HTML');
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
