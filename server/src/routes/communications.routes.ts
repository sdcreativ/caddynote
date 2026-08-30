import express, { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireFeature } from '../middleware/requireFeature.js';
import { isGlobalAdmin, isSameInstitution, getAllowedContactIds } from '../lib/authz.js';
import { isValidTwilioSignature } from '../lib/sms.js';
import { sendCommunication, queueCommunication } from '../lib/communications.js';
import { logAudit } from '../lib/audit.js';
import { isAiConfigured, aiMissingKeyMessage } from '../lib/anthropicClient.js';
import { draftCommunicationMessage } from '../lib/aiDraft.js';
import { checkQuota, QUOTA_LABELS } from '../lib/quotas.js';

/**
 * Module Communication multicanal (chap. 17, COM-001 à 005) :
 * - COM-001 : canaux e-mail (SMTP existant)/SMS/WhatsApp (Twilio, gated)/push
 *   (notifications internes existantes) derrière une même API d'envoi.
 * - COM-002 : modèles de message versionnés par établissement/langue/canal.
 * - COM-003 : préférences/consentement par canal (opt-out respecté à l'envoi).
 * - COM-004 : traçabilité du cycle de vie (`StrkCommunicationLog`), mise à
 *   jour serveur-à-serveur via webhook signé Twilio pour SMS/WhatsApp.
 * - COM-005 : accusé de réception explicite pour les communications critiques.
 *
 * Envoi effectué de façon synchrone (pas de vraie file d'attente/worker) —
 * suffisant au volume actuel, à revoir si le débit d'envoi devient un enjeu.
 */
export const communicationsRouter = Router();
communicationsRouter.use(requireAuth);

// --- Préférences de canal (COM-003) ---

communicationsRouter.get('/preferences', async (req, res) => {
  const preferences = await prisma.strkCommunicationPreference.findMany({ where: { profileId: req.auth!.sub } });
  res.json({ preferences });
});

const preferenceSchema = z.object({ optedIn: z.boolean() });

communicationsRouter.put('/preferences/:channel', async (req, res) => {
  const channel = z.enum(['email', 'sms', 'whatsapp', 'push']).safeParse(req.params.channel);
  if (!channel.success) {
    return res.status(400).json({ error: 'Canal invalide' });
  }
  const parsed = preferenceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const preference = await prisma.strkCommunicationPreference.upsert({
    where: { profileId_channel: { profileId: req.auth!.sub, channel: channel.data } },
    create: { profileId: req.auth!.sub, channel: channel.data, optedIn: parsed.data.optedIn },
    update: { optedIn: parsed.data.optedIn },
  });
  res.json({ preference });
});

// Module communication (templates, envoi, journaux, registre admin) —
// les préférences personnelles restent accessibles hors flag (consentement).
communicationsRouter.use(requireFeature('communications'));

/** Registre consentements / opt-out (admin plateforme). */
communicationsRouter.get('/preferences/registry', requireRole('admin'), async (req, res) => {
  const institutionId = typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined;
  const optedOutOnly = req.query.optedOut === 'true';
  const preferences = await prisma.strkCommunicationPreference.findMany({
    where: {
      ...(optedOutOnly ? { optedIn: false } : {}),
      ...(institutionId
        ? { profile: { institutionId } }
        : {}),
    },
    include: {
      profile: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          institutionId: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  });
  res.json({ preferences });
});

// --- Modèles de message versionnés (COM-002) ---

communicationsRouter.get('/templates', async (req, res) => {
  const institutionId = typeof req.query.institutionId === 'string' ? req.query.institutionId : req.auth!.institutionId;
  if (institutionId && !isSameInstitution(req.auth!, institutionId) && !isGlobalAdmin(req.auth!)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const { useCase, locale } = req.query;
  const channelParsed = z.enum(['email', 'sms', 'whatsapp', 'push']).optional().safeParse(req.query.channel);
  if (!channelParsed.success) {
    return res.status(400).json({ error: 'Canal invalide' });
  }
  const templates = await prisma.strkMessageTemplate.findMany({
    where: {
      isActive: true,
      OR: [{ institutionId: institutionId || null }, { institutionId: null }],
      ...(typeof useCase === 'string' ? { useCase } : {}),
      ...(channelParsed.data ? { channel: channelParsed.data } : {}),
      ...(typeof locale === 'string' ? { locale } : {}),
    },
    orderBy: [{ useCase: 'asc' }, { channel: 'asc' }],
  });
  res.json({ templates });
});

const templateSchema = z.object({
  institutionId: z.string().uuid().nullable().optional(),
  useCase: z.string().min(1),
  channel: z.enum(['email', 'sms', 'whatsapp', 'push']),
  locale: z.string().default('fr'),
  subject: z.string().optional(),
  body: z.string().min(1),
  variables: z.array(z.string()).default([]),
});

// Créer une nouvelle version d'un modèle — réservé à l'admin (modèles
// globaux) et au school_admin pour le modèle de son propre établissement.
communicationsRouter.post('/templates', requireRole('admin', 'school_admin'), async (req, res) => {
  const parsed = templateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  let institutionId = parsed.data.institutionId ?? null;
  if (!isGlobalAdmin(req.auth!)) {
    // Un school_admin ne peut créer que le modèle de son propre
    // établissement, jamais un modèle global (institutionId: null).
    if (institutionId && !isSameInstitution(req.auth!, institutionId)) {
      return res.status(403).json({ error: 'Permissions insuffisantes pour cet établissement' });
    }
    institutionId = req.auth!.institutionId ?? null;
    if (!institutionId) {
      return res.status(400).json({ error: 'Aucun établissement associé à ce compte' });
    }
  }

  const { useCase, channel, locale, subject, body, variables } = parsed.data;
  const template = await prisma.$transaction(async (tx) => {
    const current = await tx.strkMessageTemplate.findFirst({
      where: { institutionId, useCase, channel, locale },
      orderBy: { version: 'desc' },
    });
    if (current) {
      await tx.strkMessageTemplate.update({ where: { id: current.id }, data: { isActive: false } });
    }
    return tx.strkMessageTemplate.create({
      data: {
        institutionId,
        useCase,
        channel,
        locale,
        subject,
        body,
        variables,
        version: (current?.version ?? 0) + 1,
        createdBy: req.auth!.sub,
      },
    });
  });
  res.status(201).json({ template });
});

communicationsRouter.delete('/templates/:id', requireRole('admin', 'school_admin'), async (req, res) => {
  const existing = await prisma.strkMessageTemplate.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: 'Modèle introuvable' });
  }
  const canManage = existing.institutionId
    ? isSameInstitution(req.auth!, existing.institutionId)
    : isGlobalAdmin(req.auth!);
  if (!canManage) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  // Désactivation, jamais de suppression physique (historique des envois
  // passés référence encore ce modèle via StrkCommunicationLog.templateId).
  await prisma.strkMessageTemplate.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ success: true });
});

// --- Brouillon IA (hors exercices) ---

const draftSchema = z.object({
  intent: z.string().min(3).max(500),
  audience: z.string().max(200).optional(),
  tone: z.string().max(80).optional(),
  locale: z.string().max(8).optional(),
  context: z.string().max(1000).optional(),
});

communicationsRouter.post(
  '/ai/draft',
  requireRole('admin', 'school_admin', 'teacher', 'head_teacher', 'secretary'),
  requireFeature('exercises_ai'),
  async (req, res) => {
    if (!isAiConfigured()) {
      return res.status(501).json({ error: aiMissingKeyMessage() });
    }
    const parsed = draftSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
    }
    const institutionId = req.auth!.institutionId;
    if (institutionId) {
      const aiQuota = await checkQuota(institutionId, 'aiPerMonth', 1);
      if (!aiQuota.allowed) {
        return res.status(403).json({
          error: `Quota de ${QUOTA_LABELS.aiPerMonth} atteint pour le plan actuel (${aiQuota.current}/${aiQuota.limit}).`,
          code: 'quota_exceeded',
          quota: aiQuota,
        });
      }
    }
    try {
      const draft = await draftCommunicationMessage(parsed.data);
      if (institutionId) {
        await logAudit({
          institutionId,
          actorId: req.auth!.sub,
          action: 'communications.ai.draft',
          targetType: 'communication_draft',
          metadata: { intent: parsed.data.intent.slice(0, 120) },
          ipAddress: req.ip,
        });
      }
      res.json({ draft });
    } catch (err) {
      console.error('AI draft error:', err);
      res.status(502).json({ error: 'Échec de la génération du brouillon' });
    }
  }
);

// --- Envoi (COM-001) ---

const sendSchema = z.object({
  recipientId: z.string().uuid(),
  channel: z.enum(['email', 'sms', 'whatsapp', 'push']),
  useCase: z.string().optional(),
  locale: z.string().default('fr'),
  variables: z.record(z.string()).default({}),
  subject: z.string().optional(),
  body: z.string().optional(),
  isCritical: z.boolean().default(false),
});

communicationsRouter.post('/send', requireRole('admin', 'school_admin', 'teacher'), async (req, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const { recipientId } = parsed.data;

  // ORG-004 : même périmètre de contacts autorisés que la messagerie interne
  // (établissement de l'appelant, ou établissements des enfants pour un
  // parent — non atteignable ici puisque /send est réservé au personnel).
  const allowed = await getAllowedContactIds(req.auth!);
  if (allowed !== 'all' && !allowed.has(recipientId)) {
    return res.status(403).json({ error: 'Destinataire non autorisé' });
  }

  // Découplage envoi/traitement (Lot 6) : seuls les canaux dépendant d'un
  // fournisseur externe (e-mail/SMS/WhatsApp) passent par la file
  // d'attente — c'est leur latence/disponibilité réseau qui posait
  // problème dans une requête HTTP synchrone. `push` est une simple
  // écriture locale (notification interne) : aucun fournisseur externe à
  // protéger, aucune raison de la différer.
  const params = { ...parsed.data, institutionId: req.auth!.institutionId, requestedBy: req.auth!.sub };
  const result = parsed.data.channel === 'push' ? await sendCommunication(params) : await queueCommunication(params);
  if (result.ok) {
    await logAudit({
      institutionId: req.auth!.institutionId,
      actorId: req.auth!.sub,
      action: 'communication.sent',
      targetType: 'user',
      targetId: recipientId,
      metadata: { channel: parsed.data.channel, status: result.log.status },
      ipAddress: req.ip,
    });
    return res.status(result.log.status === 'queued' ? 202 : 201).json({ log: result.log });
  }
  const statusByReason = {
    not_configured: 501,
    missing_address: 400,
    missing_content: 400,
    recipient_not_found: 404,
    send_failed: 502,
    quota_exceeded: 403,
    channel_disabled: 503,
  } as const;
  return res.status(statusByReason[result.reason]).json({ error: result.error, log: result.log });
});

// --- Journal / traçabilité (COM-004) ---

communicationsRouter.get('/logs', async (req, res) => {
  const recipientId = typeof req.query.recipientId === 'string' ? req.query.recipientId : undefined;
  const institutionId = typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined;

  if (recipientId) {
    if (recipientId !== req.auth!.sub) {
      const allowed = await getAllowedContactIds(req.auth!);
      const isStaff = ['admin', 'school_admin', 'teacher'].includes(req.auth!.role);
      if (!isStaff || (allowed !== 'all' && !allowed.has(recipientId))) {
        return res.status(403).json({ error: 'Permissions insuffisantes' });
      }
    }
    const logs = await prisma.strkCommunicationLog.findMany({ where: { recipientId }, orderBy: { requestedAt: 'desc' } });
    return res.json({ logs });
  }

  const targetInstitutionId = institutionId ?? req.auth!.institutionId;
  if (!targetInstitutionId || !isSameInstitution(req.auth!, targetInstitutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const logs = await prisma.strkCommunicationLog.findMany({
    where: { institutionId: targetInstitutionId },
    orderBy: { requestedAt: 'desc' },
    take: 200,
  });
  res.json({ logs });
});

communicationsRouter.get('/logs/:id', async (req, res) => {
  const log = await prisma.strkCommunicationLog.findUnique({ where: { id: req.params.id } });
  if (!log) {
    return res.status(404).json({ error: 'Communication introuvable' });
  }
  const isRecipientOrRequester = log.recipientId === req.auth!.sub || log.requestedBy === req.auth!.sub;
  const isStaffSameInstitution = log.institutionId && isSameInstitution(req.auth!, log.institutionId);
  if (!isRecipientOrRequester && !isStaffSameInstitution) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  res.json({ log });
});

// COM-005 : accusé de réception explicite, réservé au destinataire réel.
communicationsRouter.post('/logs/:id/acknowledge', async (req, res) => {
  const log = await prisma.strkCommunicationLog.findUnique({ where: { id: req.params.id } });
  if (!log || log.recipientId !== req.auth!.sub) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  if (!log.isCritical) {
    return res.status(400).json({ error: 'Cette communication ne nécessite pas d’accusé de réception' });
  }
  const updated = await prisma.strkCommunicationLog.update({
    where: { id: log.id },
    data: { acknowledgedAt: log.acknowledgedAt ?? new Date() },
  });
  res.json({ log: updated });
});

// --- Webhook Twilio (statut de livraison SMS/WhatsApp, COM-004) ---
// Public (Twilio ne s'authentifie pas comme un utilisateur) mais vérifié par
// signature — jamais de mise à jour de statut basée sur un corps non
// authentifié (même principe FIN-005 que les webhooks de paiement).
export const communicationsPublicRouter = Router();
// Twilio poste les callbacks de statut en `application/x-www-form-urlencoded`
// (jamais du JSON) — parseur dédié à ce routeur public, indépendant de
// `express.json()` monté ailleurs (les deux coexistent sans conflit, chacun
// n'agissant que sur son propre Content-Type).
communicationsPublicRouter.use(express.urlencoded({ extended: false }));

const TWILIO_STATUS_MAP: Record<string, 'sent' | 'delivered' | 'read' | 'failed'> = {
  sent: 'sent',
  delivered: 'delivered',
  read: 'read',
  failed: 'failed',
  undelivered: 'failed',
};

communicationsPublicRouter.post('/webhooks/twilio', async (req, res) => {
  const apiUrl = process.env.API_URL || 'http://localhost:4000';
  const signature = req.headers['x-twilio-signature'] as string | undefined;
  if (!isValidTwilioSignature(signature, `${apiUrl}/communications/webhooks/twilio`, req.body)) {
    return res.status(403).send('Signature invalide');
  }

  const messageSid = req.body?.MessageSid as string | undefined;
  const messageStatus = req.body?.MessageStatus as string | undefined;
  if (!messageSid || !messageStatus) {
    return res.status(400).send('Paramètres manquants');
  }
  const status = TWILIO_STATUS_MAP[messageStatus];
  if (!status) {
    return res.sendStatus(200); // statut intermédiaire non suivi (ex. "queued", "sending")
  }

  const log = await prisma.strkCommunicationLog.findUnique({ where: { providerMessageId: messageSid } });
  if (!log) {
    return res.sendStatus(200);
  }
  const now = new Date();
  await prisma.strkCommunicationLog.update({
    where: { id: log.id },
    data: {
      status,
      ...(status === 'delivered' ? { deliveredAt: now } : {}),
      ...(status === 'read' ? { readAt: now } : {}),
      ...(status === 'failed' ? { failedAt: now, errorMessage: (req.body?.ErrorMessage as string) || 'Échec signalé par Twilio' } : {}),
    },
  });
  res.sendStatus(200);
});
