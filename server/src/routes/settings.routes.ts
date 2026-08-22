import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { invalidateMaintenanceCache } from '../middleware/maintenance.js';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get('/', async (_req, res) => {
  const settings = await prisma.strkSetting.findMany({ select: { category: true, key: true, value: true } });
  const grouped: Record<string, Record<string, unknown>> = {};
  for (const s of settings) {
    grouped[s.category] ??= {};
    grouped[s.category][s.key] = s.value;
  }
  res.json({ settings: grouped });
});

settingsRouter.get('/:category', async (req, res) => {
  const settings = await prisma.strkSetting.findMany({
    where: { category: req.params.category },
    select: { key: true, value: true },
  });
  res.json({ settings });
});

settingsRouter.get('/:category/:key', async (req, res) => {
  const setting = await prisma.strkSetting.findUnique({
    where: { category_key: { category: req.params.category, key: req.params.key } },
    select: { value: true },
  });
  res.json({ value: setting?.value ?? null });
});

const upsertSchema = z.object({
  value: z.unknown(),
  description: z.string().optional(),
  isPublic: z.boolean().optional(),
});

settingsRouter.put('/:category/:key', async (req, res) => {
  const isOwnKey = req.params.key.startsWith(`${req.auth!.sub}:`);
  const isSystemKey = req.params.category === 'system';
  const isPlatformMaintenance =
    isSystemKey && req.params.key === 'maintenanceMode';

  if (isSystemKey && req.auth!.role !== 'admin') {
    return res.status(403).json({ error: 'Seul l’admin plateforme peut modifier les réglages système' });
  }
  if (!isOwnKey && !isSystemKey && !['admin', 'school_admin'].includes(req.auth!.role)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }

  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const setting = await prisma.strkSetting.upsert({
    where: { category_key: { category: req.params.category, key: req.params.key } },
    create: {
      category: req.params.category,
      key: req.params.key,
      value: parsed.data.value as any,
      description: parsed.data.description,
      isPublic: parsed.data.isPublic ?? false,
    },
    update: {
      value: parsed.data.value as any,
      description: parsed.data.description,
      isPublic: parsed.data.isPublic ?? false,
    },
  });
  if (isPlatformMaintenance) {
    invalidateMaintenanceCache();
  }
  res.json({ setting });
});

settingsRouter.delete('/:category/:key', async (req, res) => {
  const isOwnKey = req.params.key.startsWith(`${req.auth!.sub}:`);
  if (req.params.category === 'system' && req.auth!.role !== 'admin') {
    return res.status(403).json({ error: 'Seul l’admin plateforme peut supprimer les réglages système' });
  }
  if (!isOwnKey && req.params.category !== 'system' && !['admin', 'school_admin'].includes(req.auth!.role)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  await prisma.strkSetting.deleteMany({ where: { category: req.params.category, key: req.params.key } });
  if (req.params.category === 'system' && req.params.key === 'maintenanceMode') {
    invalidateMaintenanceCache();
  }
  res.json({ success: true });
});
