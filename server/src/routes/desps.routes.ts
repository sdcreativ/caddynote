import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requirePlatformPermission } from '../middleware/requirePlatformPerm.js';
import { logAudit } from '../lib/audit.js';
import {
  buildDespsStudentExport,
  getDespsStatus,
  isDespsConfigured,
  pingDesps,
} from '../lib/despsClient.js';

/**
 * Ops DESPS / DSC — derrière platform.integrations.desps.
 * Dry-run par défaut ; envoi live uniquement si DESPS_SYNC_LIVE=true (+ config).
 */
export const despsRouter = Router();
despsRouter.use(requireAuth, requireRole('admin'), requirePlatformPermission('platform.integrations.desps'));

despsRouter.get('/status', (_req, res) => {
  res.json({ ...getDespsStatus(), pingReady: isDespsConfigured() });
});

despsRouter.post('/ping', async (_req, res) => {
  const result = await pingDesps();
  if (result.error === 'not_configured') {
    return res.status(501).json({ error: 'DESPS non configuré', ...result });
  }
  res.json(result);
});

despsRouter.post('/sync/students', async (req, res) => {
  const institutionId = z.string().uuid().safeParse(req.body?.institutionId);
  if (!institutionId.success) {
    return res.status(400).json({ error: 'institutionId UUID requis' });
  }

  const snapshot = await buildDespsStudentExport(institutionId.data);
  await logAudit({
    institutionId: institutionId.data,
    actorId: req.auth!.sub,
    action: 'desps.sync.students_dry_run',
    targetType: 'institution',
    targetId: institutionId.data,
    metadata: { count: snapshot.count, live: snapshot.live },
    ipAddress: req.ip,
  });

  // Contrat API DESPS non figé : on ne POST jamais vers l’extérieur ici,
  // même si DESPS_SYNC_LIVE=true — éviter une fuite de PII vers une URL mal
  // configurée. Live = signal ops uniquement jusqu’à branchement officiel.
  res.json({
    mode: 'dry_run',
    message: snapshot.live
      ? 'DESPS_SYNC_LIVE actif mais envoi distant non branché (contrat API à finaliser)'
      : 'Dry-run : snapshot local, aucun envoi',
    snapshot: {
      institutionId: snapshot.institutionId,
      generatedAt: snapshot.generatedAt,
      count: snapshot.count,
      truncated: snapshot.truncated,
      sample: snapshot.records.slice(0, 5),
    },
  });
});
