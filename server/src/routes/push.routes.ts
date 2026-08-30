import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { getVapidPublicKey, isWebPushConfigured } from '../lib/webPush.js';

/**
 * Abonnements Web Push utilisateur (opt-in navigateur).
 * GET /push/vapid-public-key — clé publique (null si non configuré).
 * POST /push/subscribe — enregistre endpoint + clés.
 * DELETE /push/subscribe — retire par endpoint.
 */
export const pushRouter = Router();

pushRouter.get('/vapid-public-key', (_req, res) => {
  res.json({
    configured: isWebPushConfigured(),
    publicKey: getVapidPublicKey(),
  });
});

pushRouter.use(requireAuth);

const subSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(256),
  }),
});

pushRouter.post('/subscribe', async (req, res) => {
  if (!isWebPushConfigured()) {
    return res.status(501).json({ error: 'Web Push non configuré (VAPID_* manquants)' });
  }
  const parsed = subSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Données invalides' });

  const userId = req.auth!.sub;
  const ua = req.headers['user-agent']?.slice(0, 500) ?? null;
  const sub = await prisma.strkPushSubscription.upsert({
    where: { endpoint: parsed.data.endpoint },
    create: {
      userId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent: ua,
    },
    update: {
      userId,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent: ua,
    },
  });

  await prisma.strkNotificationSetting.upsert({
    where: { userId },
    create: { userId, pushNotifications: true },
    update: { pushNotifications: true },
  });

  res.status(201).json({ id: sub.id });
});

pushRouter.delete('/subscribe', async (req, res) => {
  const endpoint = z.string().url().safeParse(req.body?.endpoint ?? req.query.endpoint);
  if (!endpoint.success) return res.status(400).json({ error: 'endpoint requis' });
  await prisma.strkPushSubscription.deleteMany({
    where: { userId: req.auth!.sub, endpoint: endpoint.data },
  });
  res.status(204).end();
});
