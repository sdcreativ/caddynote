/**
 * Smoke P1 — abonnement école Stripe Checkout (sandbox).
 *
 * Sans STRIPE_SECRET_KEY : POST /subscriptions/checkout-session → 501.
 * Avec Stripe + price ID sur un plan : retourne une URL Checkout (ne paie pas).
 *
 * Local webhook : stripe listen --forward-to localhost:4000/subscriptions/webhook
 *
 *   cd server && npm run smoke:stripe-subscription
 */
import 'dotenv/config';
import { getRecetteLogin, getRecettePassword, getRecetteEmail } from './recetteCredentials.js';

const API = (process.env.SMOKE_API_URL || process.env.RECETTE_API_URL || 'http://127.0.0.1:4000').replace(
  /\/$/,
  ''
);
const PASSWORD = getRecettePassword();

const fail = (msg: string) => {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
};
const ok = (msg: string) => console.log(`✓ ${msg}`);

const json = async (res: Response) => {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
};

async function main() {
  console.log(`Smoke Stripe abonnement — ${API}\n`);

  const health = await fetch(`${API}/health`);
  if (!health.ok) throw new Error(`API injoignable (${health.status})`);

  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: getRecetteEmail('school_admin'), password: PASSWORD }),
  });
  const loginBody = await json(login);
  const token = typeof loginBody.token === 'string' ? loginBody.token : '';
  if (login.status !== 200 || !token) {
    fail(`login direction → ${login.status}`);
    return;
  }
  ok('login direction');

  // Seed catalogue si vide (admin global)
  let plansRes = await fetch(`${API}/subscriptions/plans`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let plansBody = await json(plansRes);
  let plans =
    (plansBody.plans as
      | { id: string; name: string; stripePriceId?: string | null; isTrial?: boolean | null }[]
      | undefined) ?? [];
  if (plans.length === 0) {
    const adminLogin = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: getRecetteEmail('admin'), password: PASSWORD }),
    });
    const adminBody = await json(adminLogin);
    const adminToken = typeof adminBody.token === 'string' ? adminBody.token : '';
    if (adminLogin.status === 200 && adminToken) {
      const seed = await fetch(`${API}/subscriptions/plans/seed-public`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      });
      ok(`plans/seed-public → ${seed.status}`);
      plansRes = await fetch(`${API}/subscriptions/plans`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      plansBody = await json(plansRes);
      plans =
        (plansBody.plans as
          | { id: string; name: string; stripePriceId?: string | null; isTrial?: boolean | null }[]
          | undefined) ?? [];
    }
  }
  if (plansRes.status !== 200 || plans.length === 0) {
    fail(`GET plans → ${plansRes.status} n=${plans.length} (données métier + RECETTE_* puis plans/seed-public)`);
    return;
  }
  ok(`plans=${plans.length}`);

  const paid =
    plans.find((p) => p.stripePriceId && !p.isTrial) ??
    plans.find((p) => !p.isTrial && p.name.toLowerCase().includes('performance')) ??
    plans.find((p) => !p.isTrial) ??
    plans[0];

  const checkout = await fetch(`${API}/subscriptions/checkout-session`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId: paid.id, billingCycle: 'monthly' }),
  });
  const checkoutBody = await json(checkout);

  if (checkout.status === 501) {
    ok('checkout-session → 501 (Stripe non configuré — attendu hors sandbox)');
  } else if (checkout.status === 400) {
    ok(
      `checkout-session → 400 (plan sans price ID — définir STRIPE_SANDBOX_PRICE_MONTHLY puis données métier + RECETTE_*) : ${
        (checkoutBody.error as string) || ''
      }`
    );
  } else if (checkout.status === 200 && typeof checkoutBody.url === 'string') {
    ok(`checkout-session → url (${(checkoutBody.url as string).slice(0, 48)}…)`);
  } else {
    fail(`checkout-session → ${checkout.status} ${JSON.stringify(checkoutBody).slice(0, 240)}`);
  }

  if (process.exitCode) {
    console.error('\nSmoke Stripe abonnement échoué');
    process.exit(1);
  }
  console.log('\nSmoke Stripe abonnement OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
