/**
 * Autorisation lecture / écriture des StrkSetting + masquage des secrets.
 * GET ne dump pas la table. PUT/DELETE sont bornés au rôle et au tenant.
 */
import type { JwtPayload } from './jwt.js';
import { DIRECTION_ROLES, SUPERVISION_ROLES, isGlobalAdmin, isSameInstitution } from './authz.js';
import { redactSsoConfig, type SsoConfigStored } from './ssoConfig.js';

const INSTITUTION_KEY_RE =
  /^(?:sso|admissions|onboarding):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Clés system lisibles par la direction (hors flags / kill-switch / RoPA). */
export const SYSTEM_STAFF_READ_KEYS = new Set([
  'appName',
  'supportEmail',
  'maintenanceMode',
  'maxInstitutions',
  'maxUsersPerInstitution',
]);

/**
 * Seules ces clés peuvent être lues via `isPublic`.
 * Jamais une clé `institution:*` (SSO, admissions) — le flag DB ne suffit pas.
 */
export const PUBLIC_SETTING_KEYS = new Set(['platform:announcement', 'system:publicStatusSnapshot']);

export const isAllowlistedPublicSetting = (category: string, key: string): boolean =>
  PUBLIC_SETTING_KEYS.has(`${category}:${key}`);

const SECRET_FIELD_RE =
  /^(clientSecret|secret|apiKey|api_key|password|token|webhookSecret|privateKey|accessToken|refreshToken|codeVerifier|smtpPass|smtpPassword)$/i;

export type SettingRow = {
  category: string;
  key: string;
  value: unknown;
  isPublic?: boolean | null;
};

export const extractInstitutionIdFromSettingKey = (key: string): string | null => {
  const match = key.match(INSTITUTION_KEY_RE);
  return match?.[1] ?? null;
};

const isOwnUserKey = (auth: JwtPayload, key: string): boolean =>
  key.startsWith(`${auth.sub}:`);

/**
 * Flux OIDC pending + codes adopt : jamais exposés via l’API générique /settings.
 */
const INTERNAL_ONLY_CATEGORIES = new Set(['sso_pending', 'sso_adopt', 'mfa_challenge']);

export const isInternalOnlyCategory = (category: string): boolean => INTERNAL_ONLY_CATEGORIES.has(category);

export const canReadSetting = (auth: JwtPayload, row: Pick<SettingRow, 'category' | 'key' | 'isPublic'>): boolean => {
  if (isInternalOnlyCategory(row.category)) return false;
  if (isGlobalAdmin(auth)) return true;
  if (row.isPublic && isAllowlistedPublicSetting(row.category, row.key)) return true;
  if (isOwnUserKey(auth, row.key)) return true;

  if (row.category === 'system') {
    return DIRECTION_ROLES.includes(auth.role) && SYSTEM_STAFF_READ_KEYS.has(row.key);
  }

  if (row.category === 'platform') return false;

  if (row.category === 'institution') {
    const institutionId = extractInstitutionIdFromSettingKey(row.key);
    return Boolean(institutionId && auth.role === 'school_admin' && isSameInstitution(auth, institutionId));
  }

  if (row.category === 'notifications') {
    if (row.key.includes(':')) return false;
    return DIRECTION_ROLES.includes(auth.role) && Boolean(auth.institutionId);
  }

  if (row.category === 'attendance') {
    if (row.key.includes(':')) return false;
    return SUPERVISION_ROLES.includes(auth.role) && Boolean(auth.institutionId);
  }

  return false;
};

const ADMIN_WRITE_CATEGORIES = new Set(['system', 'platform', 'institution', 'notifications', 'attendance']);
const USER_WRITE_CATEGORIES = new Set(['notifications', 'attendance']);

/**
 * Écriture : jamais de clé hors périmètre.
 * - `sso_pending` / `sso_adopt` / `mfa_challenge` interdits (flux interne).
 * - Clé `{userId}:…` : uniquement notifications / attendance, et uniquement le titulaire.
 * - Admin : catégories allowlistées, tous tenants.
 * - Direction : uniquement `institution:{sso|admissions|onboarding}:{son établissement}`.
 */
export const canWriteSetting = (auth: JwtPayload, category: string, key: string): boolean => {
  if (isInternalOnlyCategory(category)) return false;

  if (isOwnUserKey(auth, key)) {
    return USER_WRITE_CATEGORIES.has(category);
  }

  if (isGlobalAdmin(auth)) {
    return ADMIN_WRITE_CATEGORIES.has(category);
  }

  if (auth.role === 'school_admin') {
    if (category !== 'institution') return false;
    const institutionId = extractInstitutionIdFromSettingKey(key);
    return Boolean(institutionId && isSameInstitution(auth, institutionId));
  }

  return false;
};

const redactSecretsDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redactSecretsDeep);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [field, nested] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_FIELD_RE.test(field)) {
      const present = typeof nested === 'string' && nested.length > 0;
      out[field] = present ? '********' : '';
      if (field === 'clientSecret') out.hasClientSecret = present;
    } else {
      out[field] = redactSecretsDeep(nested);
    }
  }
  return out;
};

/** Masque tout secret, y compris pour un admin plateforme. */
export const redactSettingValue = (category: string, key: string, value: unknown): unknown => {
  if (value == null) return value;
  if (category === 'institution' && key.startsWith('sso:')) {
    return redactSsoConfig(value as SsoConfigStored);
  }
  return redactSecretsDeep(value);
};

export const presentSettingValue = (
  auth: JwtPayload,
  row: SettingRow
): unknown | undefined => {
  if (!canReadSetting(auth, row)) return undefined;
  return redactSettingValue(row.category, row.key, row.value);
};
