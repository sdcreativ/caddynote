export {
  PLATFORM_PERMISSIONS,
  PLATFORM_PERMISSION_CODES,
  SCOPE_TO_PERMISSIONS,
  isPlatformPermissionCode,
  type PlatformPermissionCode,
  type PlatformPermissionDef,
} from './catalog.js';
export {
  PLATFORM_SYSTEM_ROLES,
  PLATFORM_SYSTEM_ROLE_CODES,
  SECTION_REQUIRED_PERMISSION,
  getSuperAdminMaxCount,
  isPlatformSystemRoleCode,
  type PlatformSystemRoleCode,
} from './systemRoles.js';
export { resolvePlatformAccess, userHasPlatformPermission, isPlatformStaff } from './resolve.js';
export {
  syncPlatformRbacCatalog,
  migratePlatformOpsAclToRoles,
} from './seed.js';
export {
  assignPlatformRole,
  revokePlatformRole,
  replaceUserPlatformRoles,
  listUserPlatformRoles,
  PlatformRbacError,
} from './manage.js';
