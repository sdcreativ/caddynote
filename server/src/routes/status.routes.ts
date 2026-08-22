import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

/**
 * Page status publique (SLO léger) — pas d’auth.
 * Alimentée par GET /admin/ops-metrics (snapshot settings).
 */
export const statusRouter = Router();

statusRouter.get('/', async (_req, res) => {
  const row = await prisma.strkSetting.findUnique({
    where: { category_key: { category: 'system', key: 'publicStatusSnapshot' } },
    select: { value: true, updatedAt: true },
  });
  const snap = (row?.value as {
    timestamp?: string;
    http?: { errorRate?: number; total5xx?: number; avgLatencyMs?: number | null };
    communications?: { queued?: number; failedLast24h?: number };
    history?: Array<{ timestamp: string; errorRate: number; total5xx: number }>;
  } | null) ?? null;

  const errorRate = snap?.http?.errorRate ?? 0;
  const status =
    !snap ? 'unknown' : errorRate > 0.05 || (snap.http?.total5xx ?? 0) > 50 ? 'degraded' : 'operational';

  res.json({
    service: 'CaddyNote',
    status,
    checkedAt: new Date().toISOString(),
    snapshotAt: snap?.timestamp ?? row?.updatedAt?.toISOString() ?? null,
    indicators: {
      errorRate,
      total5xx: snap?.http?.total5xx ?? null,
      avgLatencyMs: snap?.http?.avgLatencyMs ?? null,
      communicationsQueued: snap?.communications?.queued ?? null,
      communicationsFailed24h: snap?.communications?.failedLast24h ?? null,
    },
    history: snap?.history ?? [],
    notice:
      'Indicateurs issus du dernier snapshot ops (diagnostics /admin).',
  });
});
