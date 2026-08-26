import { createHash, randomBytes } from 'crypto';
import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';

/**
 * MFA obligatoire pour les rôles sensibles (IAM-003). TOTP compatible Google
 * Authenticator / Authy / 1Password, via otplib (RFC 6238).
 * Codes de secours à usage unique (hashes SHA-256) si l’appareil TOTP est perdu.
 */

const ISSUER = 'CaddyNote';
const BACKUP_CODE_COUNT = 10;
const BACKUP_HASH_PREFIX = 'caddynote-mfa-backup:';

export const generateMfaSecret = (): string => generateSecret();

export const buildOtpAuthUri = (email: string, secret: string): string =>
  generateURI({ issuer: ISSUER, label: email, secret });

export const generateMfaQrCode = (otpAuthUri: string): Promise<string> => QRCode.toDataURL(otpAuthUri);

/** Tolérance d'une période (±30s) pour absorber le décalage d'horloge entre
 * le serveur et l'appareil de l'utilisateur, comme recommandé par la RFC 6238. */
export const verifyMfaCode = async (secret: string, code: string): Promise<boolean> => {
  if (!/^\d{6}$/.test(code)) return false;
  const result = await verify({ secret, token: code, epochTolerance: 30 });
  return result.valid;
};

/** Rôles pour lesquels la MFA est obligatoire (IAM-003 « rôles sensibles »).
 * `admin` couvre toute l’équipe d’administration plateforme CaddyNote (rôles IAM séparés).
 * Direction, secrétariat et comptabilité établissement : dossiers et caisse. */
export const MFA_REQUIRED_ROLES = ['admin', 'school_admin', 'secretary', 'accountant'] as const;

export const isMfaRequiredRole = (role: string): boolean =>
  (MFA_REQUIRED_ROLES as readonly string[]).includes(role);

/** Chemins toujours accessibles sans MFA (enrôlement + session). */
export const isMfaSetupExempt = (baseUrl: string): boolean => baseUrl === '/auth';

/** Normalise un code de secours (ignore tirets / espaces, majuscules). */
export const normalizeBackupCode = (code: string): string =>
  code.replace(/[\s-]/g, '').toUpperCase();

export const hashBackupCode = (code: string): string =>
  createHash('sha256').update(`${BACKUP_HASH_PREFIX}${normalizeBackupCode(code)}`).digest('hex');

/** Génère des codes `XXXX-XXXX` (hex) — à afficher une seule fois. */
export const generateBackupCodes = (count = BACKUP_CODE_COUNT): string[] =>
  Array.from({ length: count }, () => {
    const raw = randomBytes(4).toString('hex').toUpperCase();
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });

export const hashBackupCodes = (codes: string[]): string[] => codes.map(hashBackupCode);

/**
 * Consomme un code de secours s’il correspond à un hash encore valide.
 * Retourne les hashes restants (sans le code utilisé).
 */
export const consumeBackupCode = (
  hashes: string[],
  code: string
): { ok: true; remaining: string[] } | { ok: false } => {
  if (!hashes.length) return { ok: false };
  const candidate = hashBackupCode(code);
  const idx = hashes.indexOf(candidate);
  if (idx === -1) return { ok: false };
  return { ok: true, remaining: [...hashes.slice(0, idx), ...hashes.slice(idx + 1)] };
};

/** True si la chaîne ressemble à un code de secours (pas un TOTP à 6 chiffres). */
export const looksLikeBackupCode = (code: string): boolean => {
  const n = normalizeBackupCode(code);
  return n.length >= 8 && n.length <= 16 && !/^\d{6}$/.test(code.trim());
};

/**
 * Gate MFA « prod » (hors NODE_ENV=test et hors CADDYNOTE_TEST_MODE).
 * Extrait pour la recette / tests — même règle que `requireAuth`.
 */
export const shouldEnforceMfaSetup = (opts: {
  nodeEnv: string | undefined;
  testMode: boolean;
  role: string;
  mfaEnabled: boolean;
  routeBaseUrl: string;
}): boolean => {
  if (opts.nodeEnv === 'test' || opts.testMode) return false;
  if (!isMfaRequiredRole(opts.role)) return false;
  if (isMfaSetupExempt(opts.routeBaseUrl)) return false;
  return !opts.mfaEnabled;
};
