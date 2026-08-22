import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { isGlobalAdmin, isSameInstitution } from '../lib/authz.js';
import { withSupportSla } from '../lib/supportSla.js';
import { logAudit } from '../lib/audit.js';

/**
 * SAA-006 (Lot 10) — support client structuré.
 *
 * §5.16 alignement établissement ↔ plateforme :
 * - Notes `isInternal` : réservées au personnel SDCREATIV (`admin` global),
 *   jamais visibles d’un school_admin / demandeur.
 * - Triage local (statut) : school_admin de l’établissement.
 * - Escalade : school_admin → priorité ↑, désassigné, message public, file ops.
 */
export const supportRouter = Router();
supportRouter.use(requireAuth);

const canAccessTicket = (
  auth: import('../lib/jwt.js').JwtPayload,
  ticket: { createdBy: string; institutionId: string | null; assignedTo: string | null }
): boolean => {
  if (isGlobalAdmin(auth)) return true;
  if (ticket.createdBy === auth.sub) return true;
  if (ticket.assignedTo === auth.sub) return true;
  if (ticket.institutionId && isSameInstitution(auth, ticket.institutionId) && ['admin', 'school_admin'].includes(auth.role)) {
    return true;
  }
  return false;
};

const createTicketSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  /** Admin plateforme : rattacher à un établissement client. */
  institutionId: z.string().uuid().optional(),
  /** Admin plateforme : créer au nom d’un utilisateur (sinon l’admin). */
  onBehalfOfUserId: z.string().uuid().optional(),
  /** Escalade : auto-assignation à l’admin courant. */
  escalate: z.boolean().optional(),
});

supportRouter.post('/tickets', async (req, res) => {
  const parsed = createTicketSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }

  let institutionId = req.auth!.institutionId ?? null;
  let createdBy = req.auth!.sub;
  let assignedTo: string | null = null;
  let priority = parsed.data.priority;

  if (isGlobalAdmin(req.auth!)) {
    if (parsed.data.institutionId) institutionId = parsed.data.institutionId;
    if (parsed.data.onBehalfOfUserId) {
      const behalf = await prisma.strkProfile.findUnique({
        where: { id: parsed.data.onBehalfOfUserId },
        select: { id: true, institutionId: true },
      });
      if (!behalf) return res.status(404).json({ error: 'Utilisateur introuvable' });
      createdBy = behalf.id;
      if (!institutionId) institutionId = behalf.institutionId;
    }
    if (parsed.data.escalate) {
      assignedTo = req.auth!.sub;
      if (priority === 'normal' || priority === 'low') priority = 'high';
    }
  } else if (parsed.data.institutionId || parsed.data.onBehalfOfUserId || parsed.data.escalate) {
    return res.status(403).json({ error: 'Création pour tiers réservée à l’admin plateforme' });
  }

  const ticket = await prisma.strkSupportTicket.create({
    data: {
      institutionId,
      createdBy,
      assignedTo,
      subject: parsed.data.subject,
      priority,
    },
  });
  await prisma.strkSupportTicketMessage.create({
    data: { ticketId: ticket.id, authorId: req.auth!.sub, body: parsed.data.body, isInternal: false },
  });
  res.status(201).json({ ticket: withSupportSla(ticket) });
});

supportRouter.get('/tickets', async (req, res) => {
  const auth = req.auth!;
  let where: Record<string, unknown> = isGlobalAdmin(auth)
    ? {}
    : ['admin', 'school_admin'].includes(auth.role) && auth.institutionId
      ? { institutionId: auth.institutionId }
      : { createdBy: auth.sub };

  if (isGlobalAdmin(auth)) {
    if (req.query.unassigned === '1' || req.query.unassigned === 'true') {
      where = { ...where, assignedTo: null };
    }
    if (typeof req.query.status === 'string' && req.query.status) {
      where = { ...where, status: req.query.status };
    }
    if (typeof req.query.institutionId === 'string' && req.query.institutionId) {
      where = { ...where, institutionId: req.query.institutionId };
    }
  }

  const tickets = await prisma.strkSupportTicket.findMany({
    where,
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    include: {
      creator: { select: { firstName: true, lastName: true, email: true } },
      institution: { select: { id: true, name: true } },
    },
  });
  res.json({ tickets: tickets.map(withSupportSla) });
});

supportRouter.get('/tickets/:id', async (req, res) => {
  const ticket = await prisma.strkSupportTicket.findUnique({
    where: { id: req.params.id },
    include: { institution: { select: { id: true, name: true } } },
  });
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket introuvable' });
  }
  if (!canAccessTicket(req.auth!, ticket)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  // §5.16 : notes internes = plateforme uniquement (pas le school_admin).
  const messages = await prisma.strkSupportTicketMessage.findMany({
    where: {
      ticketId: ticket.id,
      ...(isGlobalAdmin(req.auth!) ? {} : { isInternal: false }),
    },
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { firstName: true, lastName: true, role: true } } },
  });
  res.json({ ticket: withSupportSla(ticket), messages });
});

const messageSchema = z.object({
  body: z.string().min(1),
  isInternal: z.boolean().default(false),
});

supportRouter.post('/tickets/:id/messages', async (req, res) => {
  const ticket = await prisma.strkSupportTicket.findUnique({ where: { id: req.params.id } });
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket introuvable' });
  }
  if (!canAccessTicket(req.auth!, ticket)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const isInstitutionStaff = isGlobalAdmin(req.auth!) || ['admin', 'school_admin'].includes(req.auth!.role);
  // Notes internes plateforme : admin global uniquement.
  if (parsed.data.isInternal && !isGlobalAdmin(req.auth!)) {
    return res.status(403).json({ error: 'Notes internes réservées au support plateforme' });
  }
  const message = await prisma.strkSupportTicketMessage.create({
    data: {
      ticketId: ticket.id,
      authorId: req.auth!.sub,
      body: parsed.data.body,
      isInternal: parsed.data.isInternal,
    },
  });
  if (!isInstitutionStaff && ticket.status === 'waiting_on_customer') {
    await prisma.strkSupportTicket.update({ where: { id: ticket.id }, data: { status: 'in_progress' } });
  }
  res.status(201).json({ message });
});

/**
 * Escalade établissement → file plateforme (§5.16 P1).
 * school_admin (même tenant) ou admin global.
 */
supportRouter.post('/tickets/:id/escalate', requireRole('admin', 'school_admin'), async (req, res) => {
  const ticket = await prisma.strkSupportTicket.findUnique({ where: { id: req.params.id } });
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket introuvable' });
  }
  if (!canAccessTicket(req.auth!, ticket)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  if (!isGlobalAdmin(req.auth!) && ticket.institutionId !== req.auth!.institutionId) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }

  const nextPriority =
    ticket.priority === 'urgent' ? 'urgent' : ticket.priority === 'high' ? 'high' : 'high';

  const updated = await prisma.strkSupportTicket.update({
    where: { id: ticket.id },
    data: {
      priority: nextPriority,
      assignedTo: null,
      status: ticket.status === 'closed' || ticket.status === 'resolved' ? 'open' : 'in_progress',
      closedAt: null,
    },
  });

  await prisma.strkSupportTicketMessage.create({
    data: {
      ticketId: ticket.id,
      authorId: req.auth!.sub,
      body: 'Ticket escaladé vers le support plateforme SDCREATIV.',
      isInternal: false,
    },
  });

  await logAudit({
    institutionId: ticket.institutionId,
    actorId: req.auth!.sub,
    action: 'support.ticket.escalated',
    targetType: 'support_ticket',
    targetId: ticket.id,
    metadata: { fromPriority: ticket.priority, toPriority: nextPriority },
    ipAddress: req.ip,
  });

  res.json({ ticket: withSupportSla(updated) });
});

const updateTicketSchema = z.object({
  status: z.enum(['open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
});

supportRouter.patch('/tickets/:id', requireRole('admin', 'school_admin'), async (req, res) => {
  const ticket = await prisma.strkSupportTicket.findUnique({ where: { id: req.params.id } });
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket introuvable' });
  }
  if (!canAccessTicket(req.auth!, ticket)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const parsed = updateTicketSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  // Assignation plateforme : admin global uniquement (évite qu’un school_admin
  // s’auto-assigne un ticket déjà en file ops).
  if (parsed.data.assignedTo !== undefined && !isGlobalAdmin(req.auth!)) {
    return res.status(403).json({ error: 'Assignation réservée au support plateforme' });
  }
  const isClosing = parsed.data.status === 'resolved' || parsed.data.status === 'closed';
  const updated = await prisma.strkSupportTicket.update({
    where: { id: ticket.id },
    data: { ...parsed.data, ...(isClosing ? { closedAt: new Date() } : {}) },
  });
  res.json({ ticket: withSupportSla(updated) });
});
