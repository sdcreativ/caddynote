/**
 * Smoke P1 — frais d’admission CinetPay (sandbox).
 *
 * Sans clés CinetPay : vérifie 501 sur pay/cinetpay.
 * Avec CINETPAY_* : initie un paiement (retourne paymentUrl — ne complète pas).
 *
 *   cd server && npm run smoke:admission-cinetpay
 */
import 'dotenv/config';
import { getRecetteLogin, getRecettePassword, getRecetteEmail } from './recetteCredentials.js';

const API = (process.env.SMOKE_API_URL || process.env.RECETTE_API_URL || 'http://127.0.0.1:4000').replace(
  /\/$/,
  ''
);
const PASSWORD = getRecettePassword();
const stamp = `${Date.now()}`;

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
  console.log(`Smoke admission CinetPay — ${API}\n`);

  const health = await fetch(`${API}/health`);
  if (!health.ok) throw new Error(`API injoignable (${health.status})`);

  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: getRecetteEmail('school_admin'), password: PASSWORD }),
  });
  const loginBody = await json(login);
  const institutionId = (loginBody.user as { institutionId?: string } | undefined)?.institutionId;
  const token = typeof loginBody.token === 'string' ? loginBody.token : '';
  if (login.status !== 200 || !token || !institutionId) {
    fail(`login direction → ${login.status}`);
    return;
  }
  ok('login direction');

  const classesRes = await fetch(`${API}/admissions/institutions/${institutionId}/classes`);
  const classesBody = await json(classesRes);
  const classId = ((classesBody.classes as { id: string }[] | undefined) ?? [])[0]?.id;
  if (!classId) {
    fail('aucune classe publique');
    return;
  }

  const contactEmail = `smoke.cinetpay.${stamp}@recette.local`;
  const create = await fetch(`${API}/admissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      institutionId,
      classId,
      academicYear: '2026-2027',
      applicationKind: 'pre_registration',
      studentFirstName: 'Smoke',
      studentLastName: `CinetPay${stamp.slice(-4)}`,
      studentBirthDate: '2014-05-01',
      studentGender: 'female',
      contactEmail,
      guardians: [
        {
          firstName: 'Parent',
          lastName: 'Smoke',
          email: contactEmail,
          phone: '+221770000099',
          relationship: 'mother',
        },
      ],
    }),
  });
  const createBody = await json(create);
  const application = createBody.application as
    | {
        id: string;
        publicToken: string;
        applicationFeeCents?: number | null;
      }
    | undefined;
  if (create.status !== 201 || !application?.publicToken) {
    fail(`POST /admissions → ${create.status} ${JSON.stringify(createBody).slice(0, 200)}`);
    return;
  }
  ok(
    `dossier créé fee=${application.applicationFeeCents ?? 'null'} token=${application.publicToken.slice(0, 8)}…`
  );

  if (!application.applicationFeeCents || application.applicationFeeCents <= 0) {
    const fee = await fetch(`${API}/admissions/${application.id}/fee`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationFeeCents: 500000, applicationFeeCurrency: 'XOF' }),
    });
    if (![200, 201].includes(fee.status)) {
      fail(`POST fee → ${fee.status}`);
      return;
    }
    ok('frais fixés à 500000 XOF (centimes)');
  }

  const pay = await fetch(`${API}/admissions/status/${application.publicToken}/pay/cinetpay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const payBody = await json(pay);

  if (pay.status === 501) {
    ok('pay/cinetpay → 501 (CinetPay non configuré — attendu hors sandbox)');
  } else if (pay.status === 200 && typeof payBody.paymentUrl === 'string') {
    ok(`pay/cinetpay → paymentUrl (${(payBody.paymentUrl as string).slice(0, 48)}…)`);
  } else {
    fail(`pay/cinetpay → ${pay.status} ${JSON.stringify(payBody).slice(0, 240)}`);
  }

  if (process.exitCode) {
    console.error('\nSmoke admission CinetPay échoué');
    process.exit(1);
  }
  console.log('\nSmoke admission CinetPay OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
