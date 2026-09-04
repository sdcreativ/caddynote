import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { sendEmail, isEmailConfigured } from '../lib/email.js';
import { logAudit } from '../lib/audit.js';
import {
  isDemoContactSubject,
  notifyPlatformAdminsOfContact,
} from '../lib/contactDemo.js';
import { requiredEmail } from '../lib/zodHelpers.js';
import { escapeHtml } from '../lib/emailLayout.js';

/** CR/LF et séparateurs Unicode — injection d’en-tête SMTP si interpolés dans `subject`. */
export const sanitizeContactSubject = (raw: string): string =>
  raw.replace(/[\r\n\u2028\u2029]+/g, ' ').replace(/[ \t]+/g, ' ').trim();

export const buildContactEmailHtml = (input: {
  name: string;
  email: string;
  message: string;
}): string => {
  const name = escapeHtml(input.name);
  const email = escapeHtml(input.email);
  const message = escapeHtml(input.message).replace(/\n/g, '<br/>');
  return `<p><strong>De :</strong> ${name} &lt;${email}&gt;</p><p>${message}</p><p><a href="/super-admin/support-ops">Ouvrir Support ops</a></p>`;
};

/**
 * Formulaire contact public — plus de simulation côté front : persistance
 * + e-mail vers CONTACT_INBOX (ou SMTP_FROM) si configuré.
 */
export const contactPublicRouter = Router();

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de messages, réessayez plus tard.' },
  skip: () => process.env.NODE_ENV === 'test',
});

const contactSchema = z.object({
  name: z.string().min(1).max(200),
  email: requiredEmail,
  subject: z
    .string()
    .max(300)
    .transform(sanitizeContactSubject)
    .pipe(z.string().min(1).max(300)),
  message: z.string().min(10).max(5000),
});

contactPublicRouter.post('/', contactLimiter, async (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const row = await prisma.strkContactMessage.create({
    data: {
      ...parsed.data,
      ipAddress: req.ip,
    },
  });
  const isDemo = isDemoContactSubject(parsed.data.subject);
  const inbox = process.env.CONTACT_INBOX || process.env.SMTP_FROM;
  if (inbox && isEmailConfigured()) {
    await sendEmail({
      to: inbox,
      subject: isDemo
        ? `[Démo CaddyNote] ${parsed.data.subject}`
        : `[Contact CaddyNote] ${parsed.data.subject}`,
      html: buildContactEmailHtml(parsed.data),
      text: `${parsed.data.name} <${parsed.data.email}>\n\n${parsed.data.message}\n\n→ Support ops : /super-admin/support-ops`,
    });
  } else {
    console.log(
      `📬 [contact${isDemo ? '/demo' : ''}] ${parsed.data.email} — ${parsed.data.subject} (id=${row.id})`
    );
  }

  try {
    await notifyPlatformAdminsOfContact({
      contactId: row.id,
      name: parsed.data.name,
      email: parsed.data.email,
      subject: parsed.data.subject,
      isDemo,
    });
  } catch (err) {
    console.error('Notification ops contact échouée:', err);
  }

  await logAudit({
    institutionId: null,
    actorId: null,
    action: isDemo ? 'contact.demo_received' : 'contact.message_received',
    targetType: 'contact_message',
    targetId: row.id,
    metadata: { email: parsed.data.email, subject: parsed.data.subject, isDemo },
    ipAddress: req.ip,
  });
  res.status(201).json({ success: true, id: row.id, isDemo });
});
