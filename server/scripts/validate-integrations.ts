/**
 * Validation sandbox des intégrations (sans imprimer de secrets).
 *
 * Usage :
 *   cd server && npm run validate:integrations
 *
 * Options :
 *   --require=stripe,s3,cinetpay,twilio,smtp,clamav
 *     Échoue si l’une des intégrations listées est `skipped`.
 *   --report
 *     Écrit `recette-output/integrations-latest.md` (booléens + statuts, 0 secret).
 *
 * Les pings s’appuient sur la **présence des variables** (pas sur
 * `isXConfigured()`, qui reste à `false` sous `CADDYNOTE_TEST_MODE`). Ainsi
 * on peut valider les clés sandbox même si l’API locale force encore 501.
 *
 * Si une variable est absente : statut `skipped`.
 * Si présente : ping léger (SMTP verify, S3 list, Stripe balance, Twilio
 * account, CinetPay check id fictif — un 4xx métier est OK, une erreur
 * d’auth ne l’est pas).
 */
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import Stripe from 'stripe';
import { getIntegrationsStatus } from '../src/lib/diagnostics.js';
import { listObjects } from '../src/lib/s3.js';
import {
  assertSandboxIntegrationKeys,
  hasEnv,
} from '../src/lib/integrationGuard.js';
import { isTestMode } from '../src/lib/testMode.js';
import { scanBuffer } from '../src/lib/antivirus.js';

type Row = { name: string; status: 'ok' | 'skipped' | 'fail'; detail: string };

const rows: Row[] = [];
const args = process.argv.slice(2);
const requireArg = args.find((a) => a.startsWith('--require='));
const required = new Set(
  (requireArg?.slice('--require='.length) || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);
const writeReport = args.includes('--report');

const report = (name: string, status: Row['status'], detail: string) => {
  rows.push({ name, status, detail });
  const icon = status === 'ok' ? '✓' : status === 'skipped' ? '·' : '✗';
  console.log(`${icon} ${name}: ${detail}`);
};

const main = async () => {
  const liveBlock = assertSandboxIntegrationKeys();
  if (liveBlock) {
    console.error(`✗ garde-fou: ${liveBlock}`);
    process.exit(1);
  }

  console.log('— Statut runtime API (booléens, respectent CADDYNOTE_TEST_MODE) —');
  for (const i of getIntegrationsStatus()) {
    console.log(`  ${i.key}: ${i.configured ? 'configured' : 'missing'}${i.notes ? ` (${i.notes})` : ''}`);
  }
  if (isTestMode()) {
    console.log(
      '\n⚠️  CADDYNOTE_TEST_MODE=true : l’API répondra 501 sur Stripe/CinetPay/Twilio/S3 même si les pings ci-dessous passent. Pour une recette sandbox bout-en-bout, passez à false + redémarrez l’API.'
    );
  }

  console.log('\n— Pings sandbox (présence env, hors TEST_MODE) —');

  if (!hasEnv('SMTP_HOST') || !hasEnv('SMTP_FROM')) {
    report('smtp', 'skipped', 'SMTP_HOST / SMTP_FROM absent');
  } else {
    try {
      const noAuth =
        process.env.SMTP_NO_AUTH === 'true' ||
        process.env.SMTP_NO_AUTH === '1' ||
        (!process.env.SMTP_USER && !process.env.SMTP_PASS);
      const t = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        ...(noAuth ? {} : { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }),
      });
      await t.verify();
      report('smtp', 'ok', noAuth ? 'verify() OK (sans auth / Mailpit)' : 'verify() réussi');
    } catch (e) {
      report('smtp', 'fail', e instanceof Error ? e.message : 'verify failed');
    }
  }

  if (!hasEnv('S3_BUCKET') || !hasEnv('S3_ACCESS_KEY_ID') || !hasEnv('S3_SECRET_ACCESS_KEY')) {
    report('s3', 'skipped', 'S3_* absent');
  } else {
    try {
      await listObjects('__caddynote_probe__/');
      report('s3', 'ok', 'listObjects autorisé');
    } catch (e) {
      report('s3', 'fail', e instanceof Error ? e.message : 'list failed');
    }
  }

  if (!hasEnv('STRIPE_SECRET_KEY')) {
    report('stripe', 'skipped', 'STRIPE_SECRET_KEY absent');
  } else {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
      await stripe.balance.retrieve();
      const wh = hasEnv('STRIPE_WEBHOOK_SECRET');
      report(
        'stripe',
        'ok',
        wh ? 'balance.retrieve + STRIPE_WEBHOOK_SECRET présent' : 'balance.retrieve (STRIPE_WEBHOOK_SECRET manquant — webhooks 501)'
      );
    } catch (e) {
      report('stripe', 'fail', e instanceof Error ? e.message : 'stripe failed');
    }
  }

  if (!hasEnv('CINETPAY_API_KEY') || !hasEnv('CINETPAY_SITE_ID')) {
    report('cinetpay', 'skipped', 'CINETPAY_* absent');
  } else {
    try {
      const response = await fetch('https://api-checkout.cinetpay.com/v2/payment/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apikey: process.env.CINETPAY_API_KEY,
          site_id: process.env.CINETPAY_SITE_ID,
          transaction_id: 'caddynote-probe-nonexistent',
        }),
      });
      const body = (await response.json()) as { code?: string; message?: string };
      if (String(body.code) === '401' || /api.?key|auth|unauthorized/i.test(body.message ?? '')) {
        report('cinetpay', 'fail', `auth rejetée (${body.code} ${body.message})`);
      } else {
        report('cinetpay', 'ok', `API joignable (code=${body.code ?? response.status})`);
      }
    } catch (e) {
      report('cinetpay', 'fail', e instanceof Error ? e.message : 'cinetpay failed');
    }
  }

  if (!hasEnv('TWILIO_ACCOUNT_SID') || !hasEnv('TWILIO_AUTH_TOKEN') || !hasEnv('TWILIO_SMS_FROM')) {
    report('twilio', 'skipped', 'TWILIO_* (SID/TOKEN/SMS_FROM) incomplet');
  } else {
    try {
      const sid = process.env.TWILIO_ACCOUNT_SID!;
      const token = process.env.TWILIO_AUTH_TOKEN!;
      const auth = Buffer.from(`${sid}:${token}`).toString('base64');
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (response.ok) report('twilio', 'ok', 'Account fetch OK');
      else report('twilio', 'fail', `HTTP ${response.status}`);
    } catch (e) {
      report('twilio', 'fail', e instanceof Error ? e.message : 'twilio failed');
    }
  }

  if (!hasEnv('CLAMAV_HOST')) {
    report('clamav', 'skipped', 'CLAMAV_HOST absent');
  } else {
    try {
      const result = await scanBuffer(Buffer.from('CaddyNote antivirus probe'));
      report('clamav', result.scanned ? 'ok' : 'fail', result.scanned ? 'INSTREAM OK' : 'not scanned');
    } catch (e) {
      report('clamav', 'fail', e instanceof Error ? e.message : 'clamav failed');
    }
  }

  for (const name of required) {
    const row = rows.find((r) => r.name === name);
    if (!row || row.status === 'skipped') {
      report(`${name}:require`, 'fail', `--require=${name} mais intégration skipped/absente`);
    }
  }

  if (writeReport) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const outDir = path.join(root, 'recette-output');
    mkdirSync(outDir, { recursive: true });
    const md = [
      '# Validation intégrations sandbox',
      '',
      `| Champ | Valeur |`,
      `|---|---|`,
      `| Date | ${new Date().toISOString()} |`,
      `| TEST_MODE | ${isTestMode()} |`,
      `| Require | ${[...required].join(', ') || '—'} |`,
      '',
      '| Intégration | Statut | Détail |',
      '|---|---|---|',
      ...rows.map((r) => `| ${r.name} | ${r.status} | ${r.detail.replace(/\|/g, '/')} |`),
      '',
      'Aucun secret n’est inclus dans ce rapport.',
      '',
    ];
    writeFileSync(path.join(outDir, 'integrations-latest.md'), md.join('\n'));
    console.log(`\nRapport : ${path.join(outDir, 'integrations-latest.md')}`);
  }

  const failed = rows.filter((r) => r.status === 'fail');
  console.log(
    `\nRésultat : ${rows.filter((r) => r.status === 'ok').length} ok, ${rows.filter((r) => r.status === 'skipped').length} skipped, ${failed.length} fail`
  );
  process.exit(failed.length > 0 ? 1 : 0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
