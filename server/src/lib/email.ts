import nodemailer, { type Transporter } from 'nodemailer';
import { areExternalServicesDisabled } from './testMode.js';

/**
 * E-mail transactionnel (remplace l'edge function Supabase
 * `send-notification-emails`). SMTP générique plutôt qu'un SDK propriétaire
 * (SendGrid/Mailgun/SES/Resend...) : n'importe quel fournisseur expose un
 * relais SMTP, donc ce choix ne verrouille pas le client à un fournisseur
 * particulier — même principe d'adaptateur réversible que demandé au
 * cahier des charges §22 (« adaptateurs réversibles paiement/SMS/e-mail »).
 *
 * Variables : SMTP_HOST + SMTP_FROM obligatoires.
 * Auth : SMTP_USER + SMTP_PASS, sauf si SMTP_NO_AUTH=true (Mailpit local).
 * Relais local (mailpit / localhost / 127.0.0.1) : envoi autorisé même en
 * CADDYNOTE_TEST_MODE (capture locale, pas de livraison Internet).
 */

let transporter: Transporter | null = null;

const smtpNoAuth = (): boolean =>
  process.env.SMTP_NO_AUTH === 'true' || process.env.SMTP_NO_AUTH === '1';

/** Relais de capture locale (Mailpit, etc.) — jamais un serveur de prod. */
export const isLocalSmtpRelay = (): boolean => {
  const host = (process.env.SMTP_HOST || '').trim().toLowerCase();
  return (
    host === 'mailpit' ||
    host === 'caddynote-mailpit' ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === 'host.docker.internal'
  );
};

export const isEmailConfigured = (): boolean => {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();
  if (!host || !from) return false;

  if (!smtpNoAuth()) {
    if (!process.env.SMTP_USER?.trim() || !process.env.SMTP_PASS) return false;
  }

  // Capture locale : ne pas bloquer sur TEST_MODE.
  if (isLocalSmtpRelay()) return true;
  return !areExternalServicesDisabled();
};

const getTransporter = (): Transporter => {
  if (!transporter) {
    const noAuth = smtpNoAuth() || (!process.env.SMTP_USER && !process.env.SMTP_PASS);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      ...(noAuth
        ? {}
        : {
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS,
            },
          }),
      // Mailpit / labs : TLS souvent absente sur 1025.
      tls: isLocalSmtpRelay() ? { rejectUnauthorized: false } : undefined,
    });
  }
  return transporter;
};

/** Réinitialise le transporteur (tests / changement d’env à chaud). */
export const resetEmailTransporter = (): void => {
  transporter = null;
};

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/** Envoie un e-mail si SMTP est configuré ; sinon journalise et renvoie false
 * (dégradation contrôlée, jamais d'exception non gérée). */
export const sendEmail = async (params: SendEmailParams): Promise<boolean> => {
  if (!isEmailConfigured()) {
    console.log('[email] SMTP non configuré — message journalisé uniquement', {
      to: params.to,
      subject: params.subject,
    });
    return false;
  }
  await getTransporter().sendMail({
    from: process.env.SMTP_FROM,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });
  return true;
};
