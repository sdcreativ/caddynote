/**
 * Seed / synchronisation des rôles et permissions système en base.
 */

import { prisma } from '../prisma.js';
import { PLATFORM_PERMISSIONS } from './catalog.js';
import { PLATFORM_SYSTEM_ROLES, LEGACY_SCOPE_TO_ROLE } from './systemRoles.js';
import { getPlatformOpsAcl } from '../platformOps.js';

export const syncPlatformRbacCatalog = async (): Promise<{ roles: number; permissions: number }> => {
  for (const perm of PLATFORM_PERMISSIONS) {
    await prisma.strkPlatformPermission.upsert({
      where: { code: perm.code },
      create: {
        code: perm.code,
        domain: perm.domain,
        description: perm.description,
      },
      update: {
        domain: perm.domain,
        description: perm.description,
      },
    });
  }

  for (const role of PLATFORM_SYSTEM_ROLES) {
    const row = await prisma.strkPlatformRole.upsert({
      where: { code: role.code },
      create: {
        code: role.code,
        label: role.label,
        level: role.level,
        description: role.description,
        isSystem: true,
      },
      update: {
        label: role.label,
        level: role.level,
        description: role.description,
        isSystem: true,
      },
    });

    const permRows = await prisma.strkPlatformPermission.findMany({
      where: { code: { in: [...role.permissions] } },
      select: { id: true, code: true },
    });
    const byCode = new Map(permRows.map((p) => [p.code, p.id]));

    await prisma.strkPlatformRolePermission.deleteMany({ where: { roleId: row.id } });
    if (permRows.length > 0) {
      await prisma.strkPlatformRolePermission.createMany({
        data: role.permissions
          .map((code) => byCode.get(code))
          .filter((id): id is string => !!id)
          .map((permissionId) => ({ roleId: row.id, permissionId })),
        skipDuplicates: true,
      });
    }
  }

  return {
    roles: PLATFORM_SYSTEM_ROLES.length,
    permissions: PLATFORM_PERMISSIONS.length,
  };
};

/**
 * Migre `platformOpsAcl` vers `StrkPlatformUserRole`.
 * Admin sans entrée ACL → attribution `super_admin`.
 * Ne crée pas de doublons.
 */
export const migratePlatformOpsAclToRoles = async (): Promise<{ assigned: number }> => {
  await syncPlatformRbacCatalog();

  const admins = await prisma.strkProfile.findMany({
    where: { role: 'admin', isActive: true },
    select: { id: true },
  });
  const acl = await getPlatformOpsAcl();
  const roleRows = await prisma.strkPlatformRole.findMany({
    where: { isSystem: true },
    select: { id: true, code: true },
  });
  const roleIdByCode = new Map(roleRows.map((r) => [r.code, r.id]));

  let assigned = 0;
  for (const admin of admins) {
    const existing = await prisma.strkPlatformUserRole.count({ where: { userId: admin.id } });
    if (existing > 0) continue;

    const scopes = acl[admin.id];
    const codes: string[] =
      scopes && Array.isArray(scopes) && scopes.length > 0
        ? [
            ...new Set(
              scopes
                .map((s) => LEGACY_SCOPE_TO_ROLE[s as keyof typeof LEGACY_SCOPE_TO_ROLE])
                .filter(Boolean)
            ),
          ]
        : ['super_admin'];

    for (const code of codes) {
      const roleId = roleIdByCode.get(code);
      if (!roleId) continue;
      await prisma.strkPlatformUserRole.create({
        data: {
          userId: admin.id,
          roleId,
          grantedBy: null,
        },
      });
      assigned += 1;
    }
  }

  return { assigned };
};
