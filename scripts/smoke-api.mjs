#!/usr/bin/env node
/**
 * §7.4 — smoke API parcours critiques (sans navigateur).
 * Prérequis : API joignable (SMOKE_API_URL, défaut http://127.0.0.1:4000).
 *
 * Vérifie : /health, /status, OpenAPI docs optionnel.
 * Login réel : SMOKE_EMAIL + SMOKE_PASSWORD (compte staging fictif).
 */
const API = (process.env.SMOKE_API_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
};
const ok = (msg) => console.log(`✓ ${msg}`);

const get = async (path) => {
  const res = await fetch(`${API}${path}`);
  return { status: res.status, body: await res.json().catch(() => null) };
};

const post = async (path, body) => {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const health = await get('/health');
if (health.status !== 200) fail(`/health → ${health.status}`);
else ok(`/health ${JSON.stringify(health.body?.status || health.body)}`);

const status = await get('/status');
if (status.status !== 200) fail(`/status → ${status.status}`);
else ok(`/status service=${status.body?.service} status=${status.body?.status}`);

const email = process.env.SMOKE_EMAIL;
const password = process.env.SMOKE_PASSWORD;
if (email && password) {
  const login = await post('/auth/login', { email, password });
  if (login.status !== 200 || !login.body?.token) {
    fail(`/auth/login → ${login.status}`);
  } else {
    ok('login OK');
    const token = login.body.token;
    const me = await fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (me.status !== 200) fail(`/auth/me → ${me.status}`);
    else ok('/auth/me OK');
  }
} else {
  ok('login skip (SMOKE_EMAIL / SMOKE_PASSWORD non définis)');
}

if (process.exitCode) {
  console.error('Smoke API échoué');
  process.exit(1);
}
console.log('Smoke API OK');
