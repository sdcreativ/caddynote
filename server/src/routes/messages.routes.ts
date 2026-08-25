import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { isGlobalAdmin, isSameInstitution, getAllowedContactIds } from '../lib/authz.js';
import type { JwtPayload } from '../lib/jwt.js';
import { isOwnedObjectKey } from '../lib/s3.js';
import { STORAGE_FOLDER } from '../lib/storageFolders.js';

export const messagesRouter = Router();
messagesRouter.use(requireAuth);

/** Un membre du personnel (school_admin, non admin global) ne peut agir que
 * sur les messages d'un utilisateur de son propre établissement. */
const canActOnUserMessages = async (auth: JwtPayload, userId: string): Promise<boolean> => {
  if (auth.sub === userId) return true;
  if (isGlobalAdmin(auth)) return true;
  if (auth.role !== 'school_admin') return false;
  const target = await prisma.strkProfile.findUnique({ where: { id: userId }, select: { institutionId: true } });
  return !!target && isSameInstitution(auth, target.institutionId);
};

// strk_messages n'a aucune contrainte de clé étrangère côté base d'origine
// (fidèlement reproduit dans schema.prisma) : sender/recipient sont donc
// rattachés manuellement plutôt que via un `include` Prisma.
const enrichMessages = async <T extends { senderId: string; recipientId: string | null }>(messages: T[]) => {
  const ids = [...new Set(messages.flatMap((m) => [m.senderId, m.recipientId].filter((x): x is string => !!x)))];
  const profiles = await prisma.strkProfile.findMany({
    where: { id: { in: ids } },
    select: { id: true, firstName: true, lastName: true, role: true },
  });
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return messages.map((m) => ({
    ...m,
    sender: byId.get(m.senderId) ?? null,
    recipient: m.recipientId ? byId.get(m.recipientId) ?? null : null,
  }));
};

messagesRouter.get('/received', async (req, res) => {
  const userId = String(req.query.userId ?? '');
  if (!(await canActOnUserMessages(req.auth!, userId))) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const messages = await prisma.strkMessage.findMany({
    where: { recipientId: userId },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ messages: await enrichMessages(messages) });
});

messagesRouter.get('/sent', async (req, res) => {
  const userId = String(req.query.userId ?? '');
  if (!(await canActOnUserMessages(req.auth!, userId))) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const messages = await prisma.strkMessage.findMany({
    where: { senderId: userId },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ messages: await enrichMessages(messages) });
});

const messageSchema = z.object({
  recipientId: z.string().uuid().optional(),
  subject: z.string().min(1),
  content: z.string().min(1),
  messageType: z.string().default('general'),
  priority: z.string().default('normal'),
  /** Clés S3 du dossier `messages/` (DOC-005). */
  attachments: z.array(z.string().min(1)).max(5).default([]),
});

const assertMessageAttachmentKeys = (
  keys: string[],
  auth: JwtPayload
): { ok: true } | { ok: false; error: string } => {
  for (const key of keys) {
    if (
      !key.startsWith(`${STORAGE_FOLDER.messages}/`) ||
      (!isGlobalAdmin(auth) && !isOwnedObjectKey(key, STORAGE_FOLDER.messages, auth.institutionId, auth.sub))
    ) {
      return { ok: false, error: 'Pièce jointe invalide' };
    }
  }
  return { ok: true };
};

messagesRouter.post('/', async (req, res) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  // ORG-004 : un destinataire ne peut être choisi que parmi les contacts
  // autorisés (même établissement, ou établissements des enfants pour un
  // parent) — sinon n'importe quel compte pouvait écrire à n'importe quel
  // autre établissement.
  if (parsed.data.recipientId) {
    const allowed = await getAllowedContactIds(req.auth!);
    if (allowed !== 'all' && !allowed.has(parsed.data.recipientId)) {
      return res.status(403).json({ error: 'Destinataire non autorisé' });
    }
  }
  const keysOk = assertMessageAttachmentKeys(parsed.data.attachments, req.auth!);
  if (!keysOk.ok) {
    return res.status(400).json({ error: keysOk.error });
  }
  const message = await prisma.strkMessage.create({
    data: {
      recipientId: parsed.data.recipientId,
      subject: parsed.data.subject,
      content: parsed.data.content,
      messageType: parsed.data.messageType,
      priority: parsed.data.priority,
      attachments: parsed.data.attachments,
      senderId: req.auth!.sub,
    },
  });
  res.status(201).json({ message });
});

messagesRouter.patch('/:id/read', async (req, res) => {
  const message = await prisma.strkMessage.findUnique({ where: { id: req.params.id } });
  if (!message || message.recipientId !== req.auth!.sub) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  await prisma.strkMessage.update({ where: { id: req.params.id }, data: { readAt: new Date() } });
  res.json({ success: true });
});

messagesRouter.post('/:id/reply', async (req, res) => {
  const parsed = messageSchema.omit({ recipientId: true }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const original = await prisma.strkMessage.findUnique({ where: { id: req.params.id } });
  if (!original) {
    return res.status(404).json({ error: 'Message introuvable' });
  }
  // Seul le destinataire réel du message d'origine peut y répondre — sinon
  // n'importe quel compte pouvait s'insérer dans une conversation d'un autre
  // établissement en devinant/énumérant un identifiant de message.
  if (original.recipientId !== req.auth!.sub) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const keysOk = assertMessageAttachmentKeys(parsed.data.attachments, req.auth!);
  if (!keysOk.ok) {
    return res.status(400).json({ error: keysOk.error });
  }
  const reply = await prisma.strkMessage.create({
    data: {
      subject: parsed.data.subject,
      content: parsed.data.content,
      messageType: parsed.data.messageType,
      priority: parsed.data.priority,
      attachments: parsed.data.attachments,
      senderId: req.auth!.sub,
      recipientId: original.senderId,
      parentMessageId: original.id,
    },
  });
  await prisma.strkMessage.update({ where: { id: original.id }, data: { repliedAt: new Date() } });
  res.status(201).json({ message: reply });
});

// Liste des destinataires possibles pour la messagerie — restreinte au même
// établissement (ou aux établissements des enfants suivis pour un parent),
// sinon elle exposait l'annuaire complet de la plateforme à tout compte
// authentifié, tous établissements confondus (fuite ORG-004).
messagesRouter.get('/contacts', async (req, res) => {
  const allowed = await getAllowedContactIds(req.auth!);
  const profiles = await prisma.strkProfile.findMany({
    where: { id: { not: req.auth!.sub, ...(allowed === 'all' ? {} : { in: [...allowed] }) } },
    select: { id: true, firstName: true, lastName: true, role: true, institutionId: true },
    orderBy: { firstName: 'asc' },
  });
  res.json({ users: profiles });
});
