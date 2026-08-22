import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getIntegrationsStatus, getPilotReadiness } from '../lib/diagnostics.js';
import { getProcessRole, shouldRunJobs, shouldServeHttp } from '../lib/processRole.js';
import { getDatabaseTarget } from '../lib/databaseTarget.js';
import { prisma } from '../lib/prisma.js';

/**
 * Endpoints d’exploitation : santé enrichie + diagnostic intégrations
 * (admin global uniquement pour le détail).
 */
export const diagnosticsRouter = Router();

diagnosticsRouter.get('/diagnostics', requireAuth, requireRole('admin'), async (_req, res) => {
  let database: 'connected' | 'disconnected' = 'disconnected';
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = 'connected';
  } catch {
    database = 'disconnected';
  }

  const integrations = getIntegrationsStatus();
  const pilot = getPilotReadiness();
  const { countActiveAdmins, readBootstrapMarker } = await import('../lib/bootstrapAdmin.js');
  const bootstrapMarker = await readBootstrapMarker();
  const bootstrapEnvConfigured = !!(
    process.env.BOOTSTRAP_ADMIN_EMAIL || process.env.BOOTSTRAP_ADMIN_PASSWORD
  );
  res.json({
    status: database === 'connected' ? 'ok' : 'degraded',
    database,
    timestamp: new Date().toISOString(),
    processRole: getProcessRole(),
    http: shouldServeHttp(),
    jobs: shouldRunJobs(),
    databaseTarget: getDatabaseTarget(),
    integrations,
    pilot,
    rpoHintHours: Number(process.env.BACKUP_RPO_HOURS) || 24,
    backupCron: process.env.BACKUP_CRON || '0 3 * * *',
    filePurgeEnabled: process.env.FILE_PURGE_ENABLED === 'true',
    bootstrap: {
      envConfigured: bootstrapEnvConfigured,
      activeAdminCount: await countActiveAdmins(),
      markerPresent: !!bootstrapMarker,
    },
  });
});
