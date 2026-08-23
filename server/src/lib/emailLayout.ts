/**
 * Gabarit HTML transactionnel CaddyNote — e-mails modernes, brandés, responsive.
 * Logo servi depuis APP_URL (ex. http://IP:8080/logo-cn-light.png).
 */

const NAVY = '#0B1F3A';
const BLUE = '#1D70D8';
const SLATE = '#64748b';
const BORDER = '#e2e8f0';

export const appBaseUrl = (): string =>
  (process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:8080').replace(/\/$/, '');

/** Logo clair sur bandeau sombre (fichier public Vite). */
export const brandLogoUrl = (): string => `${appBaseUrl()}/logo-cn-light.png`;

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export type EmailCta = { label: string; url: string };

export interface WrapTransactionalEmailInput {
  /** Texte préheader (bandeau Gmail / Outlook). */
  preheader: string;
  /** Titre visible sous le logo. */
  title: string;
  /** Corps HTML déjà échappé / contrôlé (paragraphes, listes). */
  bodyHtml: string;
  cta?: EmailCta;
  /** Note de bas de page (sécurité, ignorez si…). */
  footerNote?: string;
}

/**
 * Enveloppe une notification dans le layout CaddyNote (table-based pour clients mail).
 */
export const wrapTransactionalEmail = (input: WrapTransactionalEmailInput): string => {
  const logo = brandLogoUrl();
  const year = new Date().getFullYear();
  const ctaBlock = input.cta
    ? `
      <tr>
        <td style="padding:8px 32px 28px;">
          <a href="${escapeHtml(input.cta.url)}"
             style="display:inline-block;background:${BLUE};color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:10px;letter-spacing:0.01em;">
            ${escapeHtml(input.cta.label)}
          </a>
        </td>
      </tr>
      <tr>
        <td style="padding:0 32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:${SLATE};">
          Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur&nbsp;:<br/>
          <a href="${escapeHtml(input.cta.url)}" style="color:${BLUE};word-break:break-all;">${escapeHtml(input.cta.url)}</a>
        </td>
      </tr>`
    : '';

  const footerNote = input.footerNote
    ? `<p style="margin:0 0 12px;font-size:12px;line-height:1.5;color:${SLATE};">${input.footerNote}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    ${escapeHtml(input.preheader)}
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${BORDER};box-shadow:0 1px 2px rgba(11,31,58,0.04);">
          <tr>
            <td style="background:${NAVY};padding:28px 32px;text-align:left;">
              <img src="${escapeHtml(logo)}" alt="CaddyNote" width="140" height="36" style="display:block;height:36px;width:auto;max-width:160px;border:0;"/>
              <p style="margin:14px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.72);">
                Gestion scolaire
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;color:${NAVY};">
                ${escapeHtml(input.title)}
              </h1>
              <div style="font-size:15px;line-height:1.65;color:#334155;">
                ${input.bodyHtml}
              </div>
            </td>
          </tr>
          ${ctaBlock}
          <tr>
            <td style="padding:8px 32px 28px;border-top:1px solid ${BORDER};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              ${footerNote}
              <p style="margin:0;font-size:12px;line-height:1.5;color:${SLATE};">
                © ${year} CaddyNote — Message automatique, merci de ne pas répondre directement à cet e-mail.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

/** Libellés FR des rôles pour invitations. */
export const roleLabelFr = (roleOrKind?: string | null): string => {
  const key = (roleOrKind || '').trim().toLowerCase();
  const map: Record<string, string> = {
    admin: 'administrateur plateforme',
    school_admin: 'administrateur d’établissement',
    teacher: 'enseignant',
    enseignant: 'enseignant',
    head_teacher: 'professeur principal',
    student: 'élève',
    élève: 'élève',
    eleve: 'élève',
    parent: 'responsable / parent',
    secretary: 'secrétaire',
    accountant: 'comptable',
    supervisor: 'surveillant',
    group_owner: 'propriétaire de groupe',
  };
  return map[key] || roleOrKind || 'utilisateur';
};
