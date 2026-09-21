/**
 * Recette 1 école sur HTTPS — direction / enseignant / parent / élève.
 *
 *   cd server && npm run recette:https
 *
 * Défaut : https://caddynote.sdcreativ.com + /api (same-origin).
 * Comptes : RECETTE_SCHOOL_ADMIN_EMAIL, RECETTE_TEACHER_EMAIL,
 * RECETTE_PARENT_EMAIL, RECETTE_STUDENT_EMAIL + RECETTE_PASSWORD.
 * Interdit : comptes démo (domaine de test / mot de passe d’exemple).
 *
 * Sans comptes école (Hostinger vide) :
 *   RECETTE_HTTPS_PUBLIC_ONLY=1 npm run recette:https
 *   → TLS / HSTS / CSP / /sign seulement.
 *
 * Logins sur le domaine public : RECETTE_HTTPS_CONFIRM=1
 * (évite d’envoyer un .env local vers la prod).
 *
 * MFA staff : un `mfaRequired` + challengeToken compte comme PASS
 * (session cookie après TOTP seulement si RECETTE_MFA_CODE est défini).
 */
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCESS_COOKIE_NAME } from '../src/lib/accessCookie.js';
import {
  isApprovedPublicHsts,
  isHttpsLoginConfirmed,
  isPublicOnlyRecette,
  resolveRecetteHttpsTarget,
} from '../src/lib/recetteHttpsTarget.js';
import { tryGetRecetteEmail, tryGetRecettePassword, type RecetteRole } from './recetteCredentials.js';

type Step = { id: string; ok: boolean; detail: string };
const steps: Step[] = [];

const record = (id: string, ok: boolean, detail: string) => {
  steps.push({ id, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id} — ${detail}`);
};

const maskEmail = (email: string): string => {
  const [local, domain] = email.split('@');
  if (!domain) return '…';
  const shown = local.slice(0, 2);
  return `${shown}…@${domain}`;
};

const json = async (res: Response) => {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text.slice(0, 240) };
  }
};

const headerLine = (res: Response, name: string): string => res.headers.get(name) ?? '';

const cookieLines = (res: Response): string[] => {
  const getter = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getter === 'function') return getter.call(res.headers);
  const single = res.headers.get('set-cookie');
  return single ? [single] : [];
};

const parseCookieFlags = (raw: string) => {
  const parts = raw.split(';').map((part) => part.trim());
  const name = parts[0]?.split('=')[0]?.trim() ?? '';
  const flags = new Set(parts.slice(1).map((part) => part.split('=')[0].trim().toLowerCase()));
  const sameSite =
    parts
      .find((part) => part.toLowerCase().startsWith('samesite='))
      ?.split('=')[1]
      ?.trim()
      .toLowerCase() ?? '';
  return {
    name,
    httpOnly: flags.has('httponly'),
    secure: flags.has('secure'),
    sameSite,
  };
};

type SchoolRole = Extract<RecetteRole, 'school_admin' | 'teacher' | 'parent' | 'student'>;

const SCHOOL_ROLES: { id: string; role: SchoolRole; label: string }[] = [
  { id: 'HTTPS-DIR', role: 'school_admin', label: 'direction' },
  { id: 'HTTPS-ENS', role: 'teacher', label: 'enseignant' },
  { id: 'HTTPS-PAR', role: 'parent', label: 'parent' },
  { id: 'HTTPS-ELV', role: 'student', label: 'élève' },
];

const isolationFor = (
  role: SchoolRole
): { label: string; path: string; expect: 'ok' | 'forbid' }[] => {
  if (role === 'school_admin') {
    return [
      { label: 'me', path: '/auth/me', expect: 'ok' },
      { label: 'students', path: '/students', expect: 'ok' },
      { label: 'admin-billing-forbid', path: '/admin/billing-metrics', expect: 'forbid' },
    ];
  }
  if (role === 'teacher') {
    return [
      { label: 'me', path: '/auth/me', expect: 'ok' },
      { label: 'finance-forbid', path: '/finance/invoices', expect: 'forbid' },
      { label: 'admissions-forbid', path: '/admissions', expect: 'forbid' },
    ];
  }
  if (role === 'parent') {
    return [
      { label: 'me', path: '/auth/me', expect: 'ok' },
      { label: 'my-children', path: '/guardians/my-children', expect: 'ok' },
      { label: 'users-forbid', path: '/users', expect: 'forbid' },
      { label: 'admissions-forbid', path: '/admissions', expect: 'forbid' },
    ];
  }
  return [
    { label: 'me', path: '/auth/me', expect: 'ok' },
    { label: 'users-forbid', path: '/users', expect: 'forbid' },
    { label: 'admissions-forbid', path: '/admissions', expect: 'forbid' },
  ];
};

const fetchTimed = (url: string, init: RequestInit = {}, ms = 15000) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(ms), redirect: 'manual' });

async function checkPublicSurface(webUrl: string, apiUrl: string): Promise<void> {
  const health = await fetchTimed(`${apiUrl}/health`);
  const healthBody = await json(health);
  record(
    'HTTPS-health',
    health.status === 200,
    health.status === 200
      ? `API ${apiUrl}/health 200`
      : `API ${health.status} ${JSON.stringify(healthBody).slice(0, 160)}`
  );

  const page = await fetchTimed(`${webUrl}/sign`);
  const html = await page.text();
  const hsts = headerLine(page, 'strict-transport-security');
  const csp = headerLine(page, 'content-security-policy');
  record(
    'HTTPS-sign',
    page.status === 200 && /<html/i.test(html),
    `GET ${webUrl}/sign → ${page.status}`
  );
  record('HTTPS-hsts', isApprovedPublicHsts(hsts), hsts || 'Strict-Transport-Security absent');
  record(
    'HTTPS-csp',
    /default-src|script-src/.test(csp) && /fonts\.googleapis\.com/.test(csp),
    csp ? 'CSP présente (fonts Google autorisées)' : 'Content-Security-Policy absente'
  );

  const apiHeaders = await fetchTimed(`${apiUrl}/health`);
  await apiHeaders.text();
  const apiHsts = headerLine(apiHeaders, 'strict-transport-security');
  record(
    'HTTPS-api-hsts',
    isApprovedPublicHsts(apiHsts),
    apiHsts || 'HSTS absent sur /api/health'
  );
}

async function loginSchoolRole(
  apiUrl: string,
  email: string,
  password: string
): Promise<{
  status: number;
  body: Record<string, unknown>;
  cookie: ReturnType<typeof parseCookieFlags> | null;
  token: string | null;
  mfaRequired: boolean;
}> {
  const res = await fetchTimed(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CaddyNote-Bearer': '1',
    },
    body: JSON.stringify({ email, password }),
  });
  const body = await json(res);
  const cookies = cookieLines(res);
  const access = cookies.map(parseCookieFlags).find((cookie) => cookie.name === ACCESS_COOKIE_NAME) ?? null;
  const mfaRequired = body.mfaRequired === true && typeof body.challengeToken === 'string';

  let token = typeof body.token === 'string' ? body.token : null;
  const mfaCode = (process.env.RECETTE_MFA_CODE || '').trim();
  if (mfaRequired && mfaCode && typeof body.challengeToken === 'string') {
    const verify = await fetchTimed(`${apiUrl}/auth/mfa/login-verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CaddyNote-Bearer': '1',
      },
      body: JSON.stringify({ challengeToken: body.challengeToken, code: mfaCode }),
    });
    const verified = await json(verify);
    if (verify.status === 200 && typeof verified.token === 'string') {
      token = verified.token;
    }
    const verifyCookies = cookieLines(verify);
    const verifiedAccess =
      verifyCookies.map(parseCookieFlags).find((cookie) => cookie.name === ACCESS_COOKIE_NAME) ?? access;
    return {
      status: verify.status,
      body: verified,
      cookie: verifiedAccess,
      token,
      mfaRequired: true,
    };
  }

  return { status: res.status, body, cookie: access, token, mfaRequired };
}

async function runIsolation(
  apiUrl: string,
  stepId: string,
  role: SchoolRole,
  token: string
): Promise<void> {
  for (const check of isolationFor(role)) {
    const res = await fetchTimed(`${apiUrl}${check.path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    await res.text();
    const ok = check.expect === 'ok' ? res.status >= 200 && res.status < 300 : res.status === 401 || res.status === 403;
    record(`${stepId}.${check.label}`, ok, `${check.path} → ${res.status} (${check.expect})`);
  }
}

async function main() {
  const target = resolveRecetteHttpsTarget();
  const publicOnly = isPublicOnlyRecette();
  console.log(`Recette 1 école HTTPS — ${target.webUrl} → ${target.apiUrl}\n`);

  await checkPublicSurface(target.webUrl, target.apiUrl);

  const schoolEmails = SCHOOL_ROLES.map((item) => ({ ...item, email: tryGetRecetteEmail(item.role) }));
  const hasSchoolAccounts = schoolEmails.some((item) => item.email);

  if (publicOnly) {
    record(
      'HTTPS-roles',
      true,
      'RECETTE_HTTPS_PUBLIC_ONLY=1 — connexions direction / enseignant / parent / élève non jouées'
    );
  } else if (!hasSchoolAccounts) {
    record(
      'HTTPS-roles',
      false,
      'Comptes école absents — définir RECETTE_SCHOOL_ADMIN_EMAIL / TEACHER / PARENT / STUDENT + RECETTE_PASSWORD (e-mails démo interdits). Hostinger n’a aujourd’hui que le super-admin.'
    );
  } else if (target.isCanonicalHttps && !isHttpsLoginConfirmed()) {
    record(
      'HTTPS-roles',
      false,
      'Cible publique : RECETTE_HTTPS_CONFIRM=1 pour jouer les 4 rôles (évite un login prod depuis un .env local)'
    );
  } else {
    const password = tryGetRecettePassword();
    for (const { id, role, label, email } of schoolEmails) {
      if (!email || !password) {
        record(
          `${id}.login`,
          false,
          `Compte ${label} manquant — définir RECETTE_${role === 'school_admin' ? 'SCHOOL_ADMIN' : role.toUpperCase()}_EMAIL et RECETTE_PASSWORD (e-mails démo interdits)`
        );
        continue;
      }

      const auth = await loginSchoolRole(target.apiUrl, email, password);
      if (auth.status === 401 || auth.status === 403) {
        record(`${id}.login`, false, `${label} ${maskEmail(email)} → ${auth.status}`);
        continue;
      }

      if (auth.mfaRequired && !auth.token) {
        record(
          `${id}.login`,
          auth.status === 200 && typeof auth.body.challengeToken === 'string',
          `${label} ${maskEmail(email)} : MFA exigée (challenge OK, session cookie après TOTP)`
        );
        continue;
      }

      const user = auth.body.user as { role?: string } | undefined;
      const roleOk = auth.status === 200 && user?.role === role;
      record(
        `${id}.login`,
        roleOk,
        roleOk
          ? `${label} ${maskEmail(email)} (${role})`
          : `${label} ${maskEmail(email)} rôle=${user?.role ?? '?'} attendu=${role} status=${auth.status}`
      );

      if (auth.cookie) {
        const cookieOk = auth.cookie.httpOnly && auth.cookie.secure;
        record(
          `${id}.cookie`,
          cookieOk,
          `${ACCESS_COOKIE_NAME} HttpOnly=${auth.cookie.httpOnly} Secure=${auth.cookie.secure} SameSite=${auth.cookie.sameSite || '?'}`
        );
      } else if (roleOk && target.isCanonicalHttps) {
        record(`${id}.cookie`, false, `${ACCESS_COOKIE_NAME} absent après login HTTPS`);
      }

      if (roleOk && auth.token) {
        await runIsolation(target.apiUrl, id, role, auth.token);
      }
    }
  }

  const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../recette-output');
  mkdirSync(outDir, { recursive: true });
  const pv = {
    at: new Date().toISOString(),
    target,
    publicOnly,
    steps,
    passed: steps.filter((step) => step.ok).length,
    failed: steps.filter((step) => !step.ok).length,
  };
  writeFileSync(path.join(outDir, 'recette-https-ecole.json'), JSON.stringify(pv, null, 2));

  const failed = steps.filter((step) => !step.ok);
  console.log(`\n${pv.passed} PASS / ${pv.failed} FAIL — PV recette-output/recette-https-ecole.json`);
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
