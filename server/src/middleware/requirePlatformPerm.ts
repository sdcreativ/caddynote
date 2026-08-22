import type { Request, Response, NextFunction } from 'express';
import {
  adminHasPlatformScope,
  type PlatformOpsScope,
} from '../lib/platformOps.js';

/** Après `requireRole('admin')` : restreint un endpoint à un scope ops. */
export const requirePlatformPerm =
  (scope: PlatformOpsScope) =>
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ error: 'Authentification requise' });
    }
    try {
      const ok = await adminHasPlatformScope(req.auth, scope);
      if (!ok) {
        return res.status(403).json({
          error: `Permission ops insuffisante (requis: ${scope})`,
          code: 'platform_perm_denied',
          scope,
        });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
