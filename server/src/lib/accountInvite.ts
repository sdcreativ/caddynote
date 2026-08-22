import { sendEmail } from './email.js';
import { isSmsConfigured, sendSms } from './sms.js';

/**
 * IAM-001 — invitation à la création de compte (e-mail + SMS si téléphone
 * et Twilio configurés). Repli : le mot de passe temporaire reste toujours
 * renvoyé au personnel appelant ; un canal absent ou en échec ne bloque
 * jamais la création.
 */

export interface AccountInviteInput {
  email: string;
  firstName: string;
  tempPassword: string;
  phoneNumber?: string | null;
  /** Libellé court pour le SMS (ex. « enseignant »). */
  accountKind?: string;
}

export interface AccountInviteResult {
  emailSent: boolean;
  smsSent: boolean;
}

const appBaseUrl = (): string => process.env.APP_URL || 'http://localhost:8080';

export const sendAccountInvite = async (input: AccountInviteInput): Promise<AccountInviteResult> => {
  const appUrl = appBaseUrl();
  const kind = input.accountKind ? ` ${input.accountKind}` : '';
  const emailSent = await sendEmail({
    to: input.email,
    subject: 'Votre compte CaddyNote a été créé',
    html: `<p>Bonjour ${input.firstName},</p><p>Un compte CaddyNote${kind} a été créé pour vous.</p><p>Identifiant : ${input.email}<br/>Mot de passe temporaire : <strong>${input.tempPassword}</strong></p><p>Connectez-vous puis changez ce mot de passe dès que possible : <a href="${appUrl}/sign">${appUrl}/sign</a></p>`,
  });

  let smsSent = false;
  const phone = input.phoneNumber?.trim();
  if (phone && isSmsConfigured()) {
    try {
      await sendSms(
        phone,
        `CaddyNote : compte${kind} créé. Identifiant ${input.email}. Mot de passe temporaire : ${input.tempPassword}. Connexion : ${appUrl}/sign`
      );
      smsSent = true;
    } catch (error) {
      console.error('Invitation SMS échouée :', error);
    }
  }

  return { emailSent, smsSent };
};
