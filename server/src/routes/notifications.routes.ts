import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { isGlobalAdmin, isSameInstitution } from '../lib/authz.js';
import type { JwtPayload } from '../lib/jwt.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

/** Un `school_admin` (hors admin global) ne peut lire/purger que les
 * notifications d'un utilisateur de son propre établissement — sinon il
 * pouvait le faire pour n'importe quel compte, tous établissements
 * confondus (fuite ORG-004). */
const canActOnUserNotifications = async (auth: JwtPayload, userId: string): Promise<boolean> => {
  if (auth.sub === userId) return true;
  if (isGlobalAdmin(auth)) return true;
  if (auth.role !== 'school_admin') return false;
  const target = await prisma.strkProfile.findUnique({ where: { id: userId }, select: { institutionId: true } });
  return !!target && isSameInstitution(auth, target.institutionId);
};

/** Créer une notification pour un tiers (ex. un enseignant notifiant un
 * élève d'un devoir à rendre) est autorisé pour le personnel d'encadrement,
 * uniquement vers un utilisateur de son propre établissement. */
const canNotifyUser = async (auth: JwtPayload, userId: string): Promise<boolean> => {
  if (auth.sub === userId) return true;
  if (isGlobalAdmin(auth)) return true;
  if (auth.role !== 'school_admin' && auth.role !== 'teacher') return false;
  const target = await prisma.strkProfile.findUnique({ where: { id: userId }, select: { institutionId: true } });
  return !!target && isSameInstitution(auth, target.institutionId);
};

notificationsRouter.get('/', async (req, res) => {
  const userId = String(req.query.userId ?? '');
  if (!(await canActOnUserNotifications(req.auth!, userId))) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const unreadOnly = req.query.unread === 'true';
  const notifications = await prisma.notification.findMany({
    where: { userId, ...(unreadOnly ? { read: false } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ notifications });
});

const notificationSchema = z.object({
  userId: z.string().uuid(),
  title: z.string().min(1),
  message: z.string().min(1),
  type: z.string().default('info'),
  actionUrl: z.string().optional(),
  data: z.unknown().optional(),
  expiresAt: z.string().optional(),
});

// Créer une notification pour un tiers est réservé au personnel
// d'encadrement (admin/school_admin/teacher), et uniquement pour un
// utilisateur de leur propre établissement — sinon n'importe quel compte
// authentifié pouvait pousser une notification à n'importe quel autre
// utilisateur du système (fuite ORG-004 + risque d'hameçonnage interne).
notificationsRouter.post('/', requireRole('admin', 'school_admin', 'teacher'), async (req, res) => {
  const parsed = notificationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  if (!(await canNotifyUser(req.auth!, parsed.data.userId))) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const { expiresAt, ...rest } = parsed.data;
  const notification = await prisma.notification.create({
    data: { ...rest, data: rest.data as any, expiresAt: expiresAt ? new Date(expiresAt) : undefined },
  });
  res.status(201).json({ notification });
});

notificationsRouter.patch('/:id/read', async (req, res) => {
  const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!notification || notification.userId !== req.auth!.sub) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const updated = await prisma.notification.update({
    where: { id: req.params.id },
    data: { read: true },
  });
  res.json({ success: true, notification: updated });
});

notificationsRouter.patch('/read-all', async (req, res) => {
  const userId = String(req.body.userId ?? '');
  if (!(await canActOnUserNotifications(req.auth!, userId))) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  await prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
  res.json({ success: true });
});

notificationsRouter.delete('/:id', async (req, res) => {
  const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!notification || notification.userId !== req.auth!.sub) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  await prisma.notification.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});
