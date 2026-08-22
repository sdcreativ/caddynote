/**
 * Smoke Mailpit : envoie un e-mail de test via SMTP local.
 *
 * Prérequis :
 *   docker compose -f docker-compose.yml -f docker-compose.mail.yml --profile mail up -d
 *
 *   cd server && npm run smoke:mailpit
 *
 * Consulter : http://localhost:8025
 *
 * Si SMTP_* est vide dans `.env`, ce script applique les défauts Mailpit
 * (localhost:1025, sans auth) — sans écrire dans `.env`.
 */
import 'dotenv/config';
import {
  isEmailConfigured,
  isLocalSmtpRelay,
  resetEmailTransporter,
  sendEmail,
} from '../src/lib/email.js';

const applyMailpitDefaults = () => {
  if (process.env.SMTP_HOST?.trim()) return false;
  process.env.SMTP_HOST = 'localhost';
  process.env.SMTP_PORT = process.env.SMTP_PORT?.trim() || '1025';
  process.env.SMTP_SECURE = 'false';
  process.env.SMTP_NO_AUTH = 'true';
  process.env.SMTP_USER = '';
  process.env.SMTP_PASS = '';
  process.env.SMTP_FROM =
    process.env.SMTP_FROM?.trim() || 'CaddyNote Local <noreply@caddynote.local>';
  resetEmailTransporter();
  return true;
};

async function main() {
  const usedDefaults = applyMailpitDefaults();
  const to = process.env.SMOKE_MAIL_TO || 'test@caddynote.local';

  console.log(usedDefaults ? 'SMTP_* vide → défauts Mailpit appliqués pour ce run' : 'SMTP_* lu depuis l’environnement');
  console.log('SMTP_HOST=', process.env.SMTP_HOST);
  console.log('SMTP_PORT=', process.env.SMTP_PORT || '587');
  console.log('SMTP_NO_AUTH=', process.env.SMTP_NO_AUTH);
  console.log('localRelay=', isLocalSmtpRelay());
  console.log('configured=', isEmailConfigured());

  if (!isEmailConfigured()) {
    console.error(
      'SMTP non configuré. Pour Mailpit, dans server/.env :\n' +
        '  SMTP_HOST=localhost\n' +
        '  SMTP_PORT=1025\n' +
        '  SMTP_NO_AUTH=true\n' +
        '  SMTP_FROM="CaddyNote Local <noreply@caddynote.local>"'
    );
    process.exit(1);
  }

  const stamp = new Date().toISOString();
  try {
    const ok = await sendEmail({
      to,
      subject: `[CaddyNote] Smoke Mailpit ${stamp}`,
      text: `Message de test local (${stamp}).`,
      html: `<p>Message de test local <strong>${stamp}</strong>.</p><p>Si tu lis ceci dans Mailpit, SMTP fonctionne.</p>`,
    });
    if (!ok) {
      console.error('Échec sendEmail');
      process.exit(1);
    }
  } catch (e) {
    console.error('Connexion SMTP impossible — Mailpit tourne-t-il ?');
    console.error(
      '  docker compose -f docker-compose.yml -f docker-compose.mail.yml --profile mail up -d'
    );
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }

  const ui = process.env.MAILPIT_UI_URL || 'http://localhost:8025';
  console.log(`OK — e-mail envoyé à ${to}`);
  console.log(`Ouvre ${ui} pour le lire`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
