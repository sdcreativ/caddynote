/**
 * Résolution runtime des rôles / permissions plateforme.
 */

import { prisma } from '../prisma.js';
import type { JwtPayload } from '../jwt.js';
import {
  type PlatformPermissionCode,
  isPlatformPermissionCode,
  SCOPE_TO_PERMISSIONS,
} from './catalog.js';
import {
  getSystemRoleDef,
  LEGACY_SCOPE_TO_ROLE,
  type PlatformSystemRoleCode,
} from './systemRoles.js';
import { getPlatformOpsAcl, type PlatformOpsScope } from '../platformOps.js';

export type ResolvedPlatformAccess = {
  roleCodes: string[];
  permissions: Set<PlatformPermissionCode>;
  /** true si le compte est admin sans aucune attribution explicite (rétrocompat). */
  legacyFullAccess: boolean;
};

const permissionsForRoleCode = (code: string): PlatformPermissionCode[] => {
  const def = getSystemRoleDef(code);
  if (def) return [...def.permissions];
  return [];
};

/**
 * Charge les attributions actives (non expirées) depuis la DB.
 * Si aucune attribution et `role === admin` → accès complet (super_admin implicite).
 * Si ACL soft historique présente et aucune attribution → dérive des rôles legacy.
 */
export const resolvePlatformAccess = async (userId: string, profileRole: string): Promise<ResolvedPlatformAccess> => {
  const now = new Date();
  const assignments = await prisma.strkPlatformUserRole.findMany({
    where: {
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    include: { role: { select: { code: true, isSystem: true } } },
  });

  if (assignments.length > 0) {
    const roleCodes = [...new Set(assignments.map((a) => a.role.code))];
    const permissions = new Set<PlatformPermissionCode>();
    for (const code of roleCodes) {
      for (const p of permissionsForRoleCode(code)) permissions.add(p);
    }
    // Permissions custom stockées en jointure (rôles non-système futurs)
    const roleIds = assignments.map((a) => a.roleId);
    const extras = await prisma.strkPlatformRolePermission.findMany({
      where: { roleId: { in: roleIds } },
      include: { permission: { select: { code: true } } },
    });
    for (const row of extras) {
      if (isPlatformPermissionCode(row.permission.code)) permissions.add(row.permission.code);
    }
    if (permissions.size > 0) permissions.add('platform.console.access');
    return { roleCodes, permissions, legacyFullAccess: false };
  }

  if (profileRole !== 'admin') {
    return { roleCodes: [], permissions: new Set(), legacyFullAccess: false };
  }

  // Rétrocompat : ACL soft → rôles dérivés
  const acl = await getPlatformOpsAcl();
  const scopes = acl[userId];
  if (scopes && Array.isArray(scopes) && scopes.length > 0) {
    const roleCodes = [
      ...new Set(
        scopes
          .map((s) => LEGACY_SCOPE_TO_ROLE[s as PlatformOpsScope])
          .filter((c): c is PlatformSystemRoleCode => !!c)
      ),
    ];
    const permissions = new Set<PlatformPermissionCode>();
    for (const code of roleCodes) {
      for (const p of permissionsForRoleCode(code)) permissions.add(p);
    }
    for (const scope of scopes) {
      const mapped = SCOPE_TO_PERMISSIONS[scope as PlatformOpsScope];
      if (mapped) for (const p of mapped) permissions.add(p);
    }
    permissions.add('platform.console.access');
    return { roleCodes, permissions, legacyFullAccess: false };
  }

  // Admin sans ACL ni attribution = super_admin implicite
  const all = permissionsForRoleCode('super_admin');
  return {
    roleCodes: ['super_admin'],
    permissions: new Set(all),
    legacyFullAccess: true,
  };
};

export const userHasPlatformPermission = async (
  auth: JwtPayload,
  permission: PlatformPermissionCode
): Promise<boolean> => {
  const access = await resolvePlatformAccess(auth.sub, auth.role);
  return access.permissions.has(permission);
};

export const userHasAnyPlatformPermission = async (
  auth: JwtPayload,
  permissions: readonly PlatformPermissionCode[]
): Promise<boolean> => {
  const access = await resolvePlatformAccess(auth.sub, auth.role);
  return permissions.some((p) => access.permissions.has(p));
};

export const isPlatformStaff = async (auth: JwtPayload): Promise<boolean> => {
  if (auth.role === 'admin') return true;
  const access = await resolvePlatformAccess(auth.sub, auth.role);
  return access.permissions.has('platform.console.access');
};

export const listActiveRoleCodes = async (userId: string, profileRole: string): Promise<string[]> => {
  const access = await resolvePlatformAccess(userId, profileRole);
  return access.roleCodes;
};
