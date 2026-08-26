import type { Request, Response, NextFunction } from 'express';
import {
  userHasAnyPlatformPermission,
  userHasPlatformPermission,
} from '../lib/platformRbac/resolve.js';
import type { PlatformPermissionCode } from '../lib/platformRbac/catalog.js';
import { SCOPE_TO_PERMISSIONS } from '../lib/platformRbac/catalog.js';
import type { PlatformOpsScope } from '../lib/platformOps.js';
import { adminHasPlatformScope } from '../lib/platformOps.js';

/** Exige au moins une des permissions plateforme listées. */
export const requirePlatformPermission =
  (...permissions: PlatformPermissionCode[]) =>
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ error: 'Authentification requise' });
    }
    try {
      const ok =
        permissions.length === 1
          ? await userHasPlatformPermission(req.auth, permissions[0]!)
          : await userHasAnyPlatformPermission(req.auth, permissions);
      if (!ok) {
        return res.status(403).json({
          error: `Permission plateforme insuffisante (requis: ${permissions.join(' | ')})`,
          code: 'platform_perm_denied',
          permissions,
        });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };

/**
 * Compat : ancien scope soft → permissions atomiques.
 * Conserve le fallback ACL tant que des admins n’ont pas d’attributions.
 */
export const requirePlatformPerm =
  (scope: PlatformOpsScope) =>
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ error: 'Authentification requise' });
    }
    try {
      const mapped = SCOPE_TO_PERMISSIONS[scope];
      if (mapped?.length) {
        const ok = await userHasAnyPlatformPermission(req.auth, mapped);
        if (ok) return next();
      }
      // Fallback legacy ACL
      const legacyOk = await adminHasPlatformScope(req.auth, scope);
      if (!legacyOk) {
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
