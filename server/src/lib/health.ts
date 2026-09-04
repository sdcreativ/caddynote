import express, { type Request, type Response } from 'express';
import { prisma } from './prisma.js';
import { getProcessRole, shouldRunJobs, shouldServeHttp } from './processRole.js';
import { registry, syncProcessRoleMetrics } from './metrics.js';

const syncRoleMetrics = (): void => {
  const role = getProcessRole();
  syncProcessRoleMetrics(shouldServeHttp(role), shouldRunJobs(role));
};

export const buildHealthBody = async () => {
  const processRole = getProcessRole();
  const http = shouldServeHttp(processRole);
  const jobs = shouldRunJobs(processRole);
  const timestamp = new Date().toISOString();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok' as const,
      database: 'connected' as const,
      timestamp,
      processRole,
      http,
      jobs,
    };
  } catch (error) {
    console.error('Health check failed:', error);
    return {
      status: 'error' as const,
      database: 'disconnected' as const,
      timestamp,
      processRole,
      http,
      jobs,
    };
  }
};

export const healthHandler = async (_req: Request, res: Response): Promise<void> => {
  syncRoleMetrics();
  const body = await buildHealthBody();
  res.status(body.status === 'ok' ? 200 : 503).json(body);
};

/** Hors NODE_ENV=test, METRICS_TOKEN est obligatoire (pas d’exposition anonyme). */
export const isMetricsAccessAllowed = (
  authorization: string | undefined,
  token = process.env.METRICS_TOKEN,
  nodeEnv = process.env.NODE_ENV
): boolean => {
  if (!token) return nodeEnv === 'test';
  return authorization === `Bearer ${token}`;
};

export const metricsHandler = async (req: Request, res: Response): Promise<void> => {
  syncRoleMetrics();
  if (!isMetricsAccessAllowed(req.headers.authorization)) {
    res.status(401).json({ error: 'Jeton de métriques invalide ou absent' });
    return;
  }
  res.setHeader('Content-Type', registry.contentType);
  res.send(await registry.metrics());
};

/**
 * Sonde minimale du process `worker` : /health et /metrics seulement.
 * Ne pas réutiliser `app` (index.ts) — ça exposerait toute l’API métier.
 */
export const startWorkerProbe = (port: number): void => {
  const probe = express();
  probe.get('/health', healthHandler);
  probe.get('/metrics', metricsHandler);
  probe.listen(port, process.env.HOST || '0.0.0.0', () => {
    console.log(`CaddyNote worker sonde http://0.0.0.0:${port}/health`);
  });
};
