import { sendEmail } from './email.js';
import { isSmsConfigured, sendSms } from './sms.js';
import { appBaseUrl, escapeHtml, roleLabelFr, wrapTransactionalEmail } from './emailLayout.js';

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
  /** Rôle technique (`school_admin`, `teacher`…) ou libellé court. */
  accountKind?: string;
  role?: string;
}

export interface AccountInviteResult {
  emailSent: boolean;
  smsSent: boolean;
}

export const sendAccountInvite = async (input: AccountInviteInput): Promise<AccountInviteResult> => {
  const appUrl = appBaseUrl();
  const signUrl = `${appUrl}/sign`;
  const roleKey = input.role || input.accountKind;
  const roleFr = roleLabelFr(roleKey);
  const first = escapeHtml(input.firstName || '');
  const emailSafe = escapeHtml(input.email);
  const passSafe = escapeHtml(input.tempPassword);

  const bodyHtml = `
    <p style="margin:0 0 16px;">Bonjour <strong>${first}</strong>,</p>
    <p style="margin:0 0 16px;">
      Un compte CaddyNote a été créé pour vous en tant que
      <strong>${escapeHtml(roleFr)}</strong>.
    </p>
    <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;margin:0 0 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
      <tr>
        <td style="padding:16px 18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#334155;">
          <p style="margin:0 0 10px;"><span style="color:#64748b;">Identifiant</span><br/><strong>${emailSafe}</strong></p>
          <p style="margin:0;"><span style="color:#64748b;">Mot de passe temporaire</span><br/><strong style="font-size:16px;letter-spacing:0.02em;">${passSafe}</strong></p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;font-weight:600;color:#0B1F3A;">Pour commencer</p>
    <ol style="margin:0 0 8px;padding-left:18px;">
      <li style="margin:0 0 8px;">Connectez-vous avec les identifiants ci-dessus.</li>
      <li style="margin:0 0 8px;">Changez immédiatement le mot de passe temporaire.</li>
      <li style="margin:0;">Activez la double authentification si elle vous est proposée.</li>
    </ol>
  `;

  const html = wrapTransactionalEmail({
    preheader: `Votre accès CaddyNote (${roleFr}) est prêt`,
    title: 'Bienvenue sur CaddyNote',
    bodyHtml,
    cta: { label: 'Se connecter', url: signUrl },
    footerNote:
      'Ce mot de passe expire ou doit être changé rapidement. Si vous n’attendiez pas ce message, contactez votre établissement.',
  });

  const text = `Bonjour ${input.firstName},

Un compte CaddyNote (${roleFr}) a été créé pour vous.

Identifiant : ${input.email}
Mot de passe temporaire : ${input.tempPassword}

Connexion : ${signUrl}

Changez ce mot de passe dès votre première connexion.
`;

  const emailSent = await sendEmail({
    to: input.email,
    subject: `Votre accès CaddyNote (${roleFr})`,
    html,
    text,
  });

  let smsSent = false;
  const phone = input.phoneNumber?.trim();
  if (phone && isSmsConfigured()) {
    try {
      await sendSms(
        phone,
        `CaddyNote : compte ${roleFr} créé. Identifiant ${input.email}. MDP temporaire : ${input.tempPassword}. Connexion : ${signUrl}`
      );
      smsSent = true;
    } catch (error) {
      console.error('Invitation SMS échouée :', error);
    }
  }

  return { emailSent, smsSent };
};
