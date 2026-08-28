import { sendEmail } from './email.js';
import { escapeHtml, wrapTransactionalEmail } from './emailLayout.js';
import { prisma } from './prisma.js';

/**
 * Prospect contact (formulaire démo / contact) lié à un ticket support
 * via `StrkContactMessage.convertedTicketId`.
 */
export const findProspectForTicket = async (ticketId: string) =>
  prisma.strkContactMessage.findFirst({
    where: { convertedTicketId: ticketId },
    select: { id: true, name: true, email: true, subject: true },
    orderBy: { createdAt: 'desc' },
  });

/**
 * Notifie le prospect par e-mail lorsqu’un agent plateforme répond
 * (message public, pas une note interne).
 */
export const emailProspectSupportReply = async (params: {
  ticketId: string;
  ticketSubject: string;
  body: string;
}): Promise<{ emailed: boolean; prospectEmail: string | null }> => {
  const prospect = await findProspectForTicket(params.ticketId);
  if (!prospect?.email) {
    return { emailed: false, prospectEmail: null };
  }

  const firstName = escapeHtml(prospect.name.split(/\s+/)[0] || prospect.name);
  const safeBody = escapeHtml(params.body).replace(/\n/g, '<br/>');
  const subject = `Re: ${params.ticketSubject}`.slice(0, 200);

  const html = wrapTransactionalEmail({
    preheader: 'Réponse de l’équipe CaddyNote à votre demande',
    title: 'Réponse à votre demande',
    bodyHtml: `
      <p style="margin:0 0 16px;">Bonjour <strong>${firstName}</strong>,</p>
      <p style="margin:0 0 16px;">L’équipe CaddyNote vous répond concernant votre demande :</p>
      <div style="margin:0 0 16px;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;font-size:14px;line-height:1.5;color:#334155;">
        ${safeBody}
      </div>
      <p style="margin:0;font-size:13px;color:#64748b;">
        Vous pouvez répondre directement à cet e-mail si votre messagerie le permet,
        ou nous recontacter via le formulaire du site.
      </p>
    `,
    footerNote: 'Ce message fait suite à votre demande de contact / démonstration CaddyNote.',
  });

  const text = `Bonjour ${prospect.name},

L’équipe CaddyNote vous répond concernant « ${params.ticketSubject} » :

${params.body}

— CaddyNote / SDCREATIV
`;

  const emailed = await sendEmail({
    to: prospect.email,
    subject,
    html,
    text,
  });

  return { emailed, prospectEmail: prospect.email };
};
