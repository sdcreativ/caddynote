import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { sendEmail, isEmailConfigured } from '../lib/email.js';
import { logAudit } from '../lib/audit.js';

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
  email: z.string().email(),
  subject: z.string().min(1).max(300),
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
  const inbox = process.env.CONTACT_INBOX || process.env.SMTP_FROM;
  if (inbox && isEmailConfigured()) {
    await sendEmail({
      to: inbox,
      subject: `[Contact CaddyNote] ${parsed.data.subject}`,
      html: `<p><strong>De :</strong> ${parsed.data.name} &lt;${parsed.data.email}&gt;</p><p>${parsed.data.message.replace(/\n/g, '<br/>')}</p>`,
      text: `${parsed.data.name} <${parsed.data.email}>\n\n${parsed.data.message}`,
    });
  } else {
    console.log(`📬 [contact] ${parsed.data.email} — ${parsed.data.subject} (id=${row.id})`);
  }
  await logAudit({
    institutionId: null,
    actorId: null,
    action: 'contact.message_received',
    targetType: 'contact_message',
    targetId: row.id,
    metadata: { email: parsed.data.email, subject: parsed.data.subject },
    ipAddress: req.ip,
  });
  res.status(201).json({ success: true, id: row.id });
});
