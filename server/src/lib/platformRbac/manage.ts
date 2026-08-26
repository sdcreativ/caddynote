/**
 * Attribution / révocation des rôles plateforme.
 */

import { prisma } from '../prisma.js';
import { logAudit } from '../audit.js';
import {
  getSuperAdminMaxCount,
  isPlatformSystemRoleCode,
  RBAC_MANAGER_ROLES,
} from './systemRoles.js';
import { resolvePlatformAccess } from './resolve.js';
import { syncPlatformRbacCatalog } from './seed.js';

export class PlatformRbacError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
  }
}

export const assertCanManageRbac = async (actorId: string, actorRole: string): Promise<void> => {
  const access = await resolvePlatformAccess(actorId, actorRole);
  const canManage =
    access.permissions.has('platform.rbac.manage') ||
    access.roleCodes.some((c) => (RBAC_MANAGER_ROLES as readonly string[]).includes(c));
  if (!canManage) {
    throw new PlatformRbacError('Permission RBAC insuffisante', 403, 'platform_perm_denied');
  }
};

export const countActiveSuperAdmins = async (): Promise<number> => {
  const now = new Date();
  const role = await prisma.strkPlatformRole.findUnique({
    where: { code: 'super_admin' },
    select: { id: true },
  });
  if (!role) return 0;
  return prisma.strkPlatformUserRole.count({
    where: {
      roleId: role.id,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
};

export type AssignPlatformRoleInput = {
  userId: string;
  roleCode: string;
  countryCode?: string | null;
  expiresAt?: Date | null;
  actorId: string;
  actorRole: string;
  ipAddress?: string;
};

export const assignPlatformRole = async (input: AssignPlatformRoleInput) => {
  await assertCanManageRbac(input.actorId, input.actorRole);
  await syncPlatformRbacCatalog();

  if (!isPlatformSystemRoleCode(input.roleCode)) {
    throw new PlatformRbacError('Rôle plateforme inconnu', 400);
  }

  const target = await prisma.strkProfile.findUnique({
    where: { id: input.userId },
    select: { id: true, role: true, isActive: true },
  });
  if (!target?.isActive) {
    throw new PlatformRbacError('Utilisateur introuvable ou inactif', 404);
  }
  if (target.role !== 'admin') {
    throw new PlatformRbacError(
      'Seuls les comptes `admin` (équipe CaddyNote) peuvent recevoir un rôle plateforme',
      400
    );
  }

  if (input.roleCode === 'super_admin') {
    const actorAccess = await resolvePlatformAccess(input.actorId, input.actorRole);
    if (!actorAccess.permissions.has('platform.rbac.promote_super_admin')) {
      throw new PlatformRbacError(
        'Promotion en super administrateur non autorisée',
        403,
        'platform_perm_denied'
      );
    }
    const existing = await prisma.strkPlatformUserRole.findFirst({
      where: {
        userId: input.userId,
        role: { code: 'super_admin' },
      },
    });
    if (!existing) {
      const count = await countActiveSuperAdmins();
      const max = getSuperAdminMaxCount();
      if (count >= max) {
        throw new PlatformRbacError(
          `Plafond de super administrateurs atteint (${max})`,
          409,
          'super_admin_cap'
        );
      }
    }
  }

  const role = await prisma.strkPlatformRole.findUnique({ where: { code: input.roleCode } });
  if (!role) throw new PlatformRbacError('Rôle non seedé', 500);

  const country =
    input.countryCode && /^[A-Z]{2}$/.test(input.countryCode) ? input.countryCode : null;

  const row = await prisma.strkPlatformUserRole.upsert({
    where: {
      userId_roleId: { userId: input.userId, roleId: role.id },
    },
    create: {
      userId: input.userId,
      roleId: role.id,
      countryCode: country,
      expiresAt: input.expiresAt ?? null,
      grantedBy: input.actorId,
    },
    update: {
      countryCode: country,
      expiresAt: input.expiresAt ?? null,
      grantedBy: input.actorId,
      grantedAt: new Date(),
    },
    include: { role: true },
  });

  await logAudit({
    institutionId: null,
    actorId: input.actorId,
    action: 'platform.rbac.assign',
    targetType: 'platform_user_role',
    targetId: row.id,
    metadata: { userId: input.userId, roleCode: input.roleCode, countryCode: country },
    ipAddress: input.ipAddress,
  });

  return row;
};

export const revokePlatformRole = async (opts: {
  userId: string;
  roleCode: string;
  actorId: string;
  actorRole: string;
  ipAddress?: string;
}) => {
  await assertCanManageRbac(opts.actorId, opts.actorRole);

  if (opts.roleCode === 'super_admin') {
    const actorAccess = await resolvePlatformAccess(opts.actorId, opts.actorRole);
    if (!actorAccess.permissions.has('platform.rbac.promote_super_admin')) {
      throw new PlatformRbacError(
        'Révocation d’un super administrateur non autorisée',
        403,
        'platform_perm_denied'
      );
    }
  }

  const role = await prisma.strkPlatformRole.findUnique({ where: { code: opts.roleCode } });
  if (!role) throw new PlatformRbacError('Rôle inconnu', 404);

  const deleted = await prisma.strkPlatformUserRole.deleteMany({
    where: { userId: opts.userId, roleId: role.id },
  });
  if (deleted.count === 0) {
    throw new PlatformRbacError('Attribution introuvable', 404);
  }

  await logAudit({
    institutionId: null,
    actorId: opts.actorId,
    action: 'platform.rbac.revoke',
    targetType: 'user',
    targetId: opts.userId,
    metadata: { roleCode: opts.roleCode },
    ipAddress: opts.ipAddress,
  });
};

export const listUserPlatformRoles = async (userId: string) => {
  const now = new Date();
  return prisma.strkPlatformUserRole.findMany({
    where: { userId },
    include: { role: true },
    orderBy: { grantedAt: 'desc' },
  }).then((rows) =>
    rows.map((r) => ({
      id: r.id,
      roleCode: r.role.code,
      label: r.role.label,
      level: r.role.level,
      countryCode: r.countryCode,
      expiresAt: r.expiresAt,
      grantedAt: r.grantedAt,
      grantedBy: r.grantedBy,
      active: !r.expiresAt || r.expiresAt > now,
    }))
  );
};

export const replaceUserPlatformRoles = async (opts: {
  userId: string;
  roleCodes: string[];
  actorId: string;
  actorRole: string;
  countryCode?: string | null;
  ipAddress?: string;
}) => {
  await assertCanManageRbac(opts.actorId, opts.actorRole);
  const unique = [...new Set(opts.roleCodes)];
  for (const code of unique) {
    if (!isPlatformSystemRoleCode(code)) {
      throw new PlatformRbacError(`Rôle inconnu: ${code}`, 400);
    }
  }

  const current = await listUserPlatformRoles(opts.userId);
  const currentCodes = new Set(current.filter((c) => c.active).map((c) => c.roleCode));
  const nextCodes = new Set(unique);

  for (const code of currentCodes) {
    if (!nextCodes.has(code)) {
      await revokePlatformRole({
        userId: opts.userId,
        roleCode: code,
        actorId: opts.actorId,
        actorRole: opts.actorRole,
        ipAddress: opts.ipAddress,
      });
    }
  }
  for (const code of nextCodes) {
    if (!currentCodes.has(code)) {
      await assignPlatformRole({
        userId: opts.userId,
        roleCode: code,
        countryCode: opts.countryCode,
        actorId: opts.actorId,
        actorRole: opts.actorRole,
        ipAddress: opts.ipAddress,
      });
    }
  }

  return listUserPlatformRoles(opts.userId);
};
