import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { verifyAccessToken } from '../lib/jwt.js';

type Cache = { enabled: boolean; checkedAt: number };

let cache: Cache | null = null;
const CACHE_MS = 5_000;

const ALLOW_PREFIXES = [
  '/health',
  '/metrics',
  '/subscriptions/webhook',
  '/openapi.json',
  '/docs',
  '/auth',
  '/contact',
];

const readMaintenanceEnabled = async (): Promise<boolean> => {
  if (process.env.MAINTENANCE_MODE === 'true') return true;
  const now = Date.now();
  if (cache && now - cache.checkedAt < CACHE_MS) return cache.enabled;

  try {
    const setting = await prisma.strkSetting.findUnique({
      where: { category_key: { category: 'system', key: 'maintenanceMode' } },
      select: { value: true },
    });
    const enabled =
      setting?.value === true ||
      setting?.value === 'true' ||
      (typeof setting?.value === 'object' &&
        setting.value !== null &&
        (setting.value as { enabled?: boolean }).enabled === true);
    cache = { enabled: !!enabled, checkedAt: now };
    return !!enabled;
  } catch {
    return false;
  }
};

/** Invalide le cache après un PUT settings (optionnel). */
export const invalidateMaintenanceCache = () => {
  cache = null;
};

/**
 * Mode maintenance plateforme : 503 pour tout le monde sauf
 * health/metrics/webhook/auth et les JWT rôle admin.
 */
export const maintenanceMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const enabled = await readMaintenanceEnabled();
  if (!enabled) return next();

  const path = req.path || '/';
  if (ALLOW_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    return next();
  }

  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = verifyAccessToken(header.slice('Bearer '.length));
      if (payload.role === 'admin') return next();
    } catch {
      // ignore — treated as unauthenticated
    }
  }

  res.setHeader('Retry-After', '300');
  return res.status(503).json({
    error: 'La plateforme est en maintenance. Réessayez plus tard.',
    code: 'MAINTENANCE',
  });
};
