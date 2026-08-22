import { prisma } from './prisma.js';
import type { JwtPayload } from './jwt.js';

/**
 * RBAC ops plateforme (MVP) — tous les comptes `admin` accèdent au Super Admin,
 * mais un ACL optionnel peut restreindre les scopes. Sans entrée ACL = accès
 * complet (rétrocompat).
 */
export type PlatformOpsScope = 'support' | 'billing' | 'security' | 'ops';

export const ALL_PLATFORM_OPS_SCOPES: PlatformOpsScope[] = [
  'support',
  'billing',
  'security',
  'ops',
];

type AclMap = Record<string, PlatformOpsScope[]>;

const ACL_CATEGORY = 'system';
const ACL_KEY = 'platformOpsAcl';

export const getPlatformOpsAcl = async (): Promise<AclMap> => {
  const setting = await prisma.strkSetting.findUnique({
    where: { category_key: { category: ACL_CATEGORY, key: ACL_KEY } },
    select: { value: true },
  });
  const raw = setting?.value;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as AclMap;
};

export const setPlatformOpsAcl = async (acl: AclMap): Promise<AclMap> => {
  await prisma.strkSetting.upsert({
    where: { category_key: { category: ACL_CATEGORY, key: ACL_KEY } },
    create: {
      category: ACL_CATEGORY,
      key: ACL_KEY,
      value: acl,
      description: 'ACL scopes Super Admin (support|billing|security|ops)',
      isPublic: false,
    },
    update: { value: acl },
  });
  return acl;
};

export const getScopesForAdmin = async (userId: string): Promise<PlatformOpsScope[]> => {
  const acl = await getPlatformOpsAcl();
  const entry = acl[userId];
  if (!entry || !Array.isArray(entry) || entry.length === 0) {
    return [...ALL_PLATFORM_OPS_SCOPES];
  }
  return entry.filter((s): s is PlatformOpsScope =>
    (ALL_PLATFORM_OPS_SCOPES as string[]).includes(s)
  );
};

export const adminHasPlatformScope = async (
  auth: JwtPayload,
  scope: PlatformOpsScope
): Promise<boolean> => {
  if (auth.role !== 'admin') return false;
  const scopes = await getScopesForAdmin(auth.sub);
  return scopes.includes(scope);
};
