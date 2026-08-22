import type { Request, Response, NextFunction } from 'express';
import { isFeatureEnabled, canonicalizeFeatureKey } from '../lib/featureFlags.js';

/**
 * Bloque une route métier si le flag établissement est désactivé.
 * Admin global sans institutionId : laisse passer (ops cross-tenant).
 */
export const requireFeature =
  (featureKey: string) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const institutionId = req.auth?.institutionId;
    if (!institutionId) {
      return next();
    }
    try {
      const enabled = await isFeatureEnabled(institutionId, featureKey);
      if (!enabled) {
        return res.status(403).json({
          error: `Fonctionnalité désactivée pour cet établissement (${canonicalizeFeatureKey(featureKey)})`,
          code: 'feature_disabled',
          feature: canonicalizeFeatureKey(featureKey),
        });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
