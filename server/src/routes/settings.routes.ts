import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { invalidateMaintenanceCache } from '../middleware/maintenance.js';
import {
  canWriteSetting,
  isAllowlistedPublicSetting,
  presentSettingValue,
  redactSettingValue,
} from '../lib/settingAccess.js';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get('/', async (req, res) => {
  const rows = await prisma.strkSetting.findMany({
    select: { category: true, key: true, value: true, isPublic: true },
  });
  const grouped: Record<string, Record<string, unknown>> = {};
  for (const row of rows) {
    const value = presentSettingValue(req.auth!, row);
    if (value === undefined) continue;
    grouped[row.category] ??= {};
    grouped[row.category][row.key] = value;
  }
  res.json({ settings: grouped });
});

settingsRouter.get('/:category', async (req, res) => {
  const rows = await prisma.strkSetting.findMany({
    where: { category: req.params.category },
    select: { category: true, key: true, value: true, isPublic: true },
  });
  const settings = rows.flatMap((row) => {
    const value = presentSettingValue(req.auth!, row);
    if (value === undefined) return [];
    return [{ key: row.key, value }];
  });
  res.json({ settings });
});

settingsRouter.get('/:category/:key', async (req, res) => {
  const setting = await prisma.strkSetting.findUnique({
    where: { category_key: { category: req.params.category, key: req.params.key } },
    select: { category: true, key: true, value: true, isPublic: true },
  });
  if (!setting) {
    return res.json({ value: null });
  }
  const value = presentSettingValue(req.auth!, setting);
  res.json({ value: value === undefined ? null : value });
});

const upsertSchema = z.object({
  value: z.unknown(),
  description: z.string().optional(),
  isPublic: z.boolean().optional(),
});

settingsRouter.put('/:category/:key', async (req, res) => {
  const { category, key } = req.params;
  if (!canWriteSetting(req.auth!, category, key)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }

  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }

  if (category === 'institution' && key.startsWith('sso:')) {
    try {
      const { assertSsoSettingValueSafe } = await import('../lib/ssoConfig.js');
      await assertSsoSettingValueSafe(parsed.data.value);
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error && error.message === 'azureTenantId invalide' ? error.message : 'issuerUrl non autorisée',
      });
    }
  }

  const wantsPublic = req.auth!.role === 'admin' && parsed.data.isPublic === true;
  const isPublic = wantsPublic && isAllowlistedPublicSetting(category, key);
  const setting = await prisma.strkSetting.upsert({
    where: { category_key: { category, key } },
    create: {
      category,
      key,
      value: parsed.data.value as any,
      description: parsed.data.description,
      isPublic,
    },
    update: {
      value: parsed.data.value as any,
      description: parsed.data.description,
      isPublic,
    },
  });
  if (category === 'system' && key === 'maintenanceMode') {
    invalidateMaintenanceCache();
  }
  res.json({
    setting: {
      ...setting,
      value: redactSettingValue(setting.category, setting.key, setting.value),
    },
  });
});

settingsRouter.delete('/:category/:key', async (req, res) => {
  const { category, key } = req.params;
  if (!canWriteSetting(req.auth!, category, key)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  await prisma.strkSetting.deleteMany({ where: { category, key } });
  if (category === 'system' && key === 'maintenanceMode') {
    invalidateMaintenanceCache();
  }
  res.json({ success: true });
});
