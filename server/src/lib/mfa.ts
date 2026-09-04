import { createHash, randomBytes } from 'crypto';
import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';
import { prisma } from './prisma.js';

/**
 * MFA TOTP pour CaddyNote (IAM-003). Compatible Google Authenticator / Authy / 1Password
 * via otplib (RFC 6238). Codes de secours à usage unique (hashes SHA-256).
 *
 * Rôles à données sensibles : grâce de 7 jours après la 1ʳᵉ connexion sans MFA
 * (bandeau), puis obligation API + dialog bloquant. Challenge TOTP au login
 * si déjà activée.
 *
 * Personnel avec accès notes / dossiers / finance / multi-établissements :
 * inclus. Élèves et parents : MFA optionnelle (appareils souvent partagés) —
 * écart documenté, pas une obligation produit.
 */

const ISSUER = 'CaddyNote';
const BACKUP_CODE_COUNT = 10;
const BACKUP_HASH_PREFIX = 'caddynote-mfa-backup:';

/** Jours de grâce MFA après le premier login sans 2FA (option A hardening prod). */
export const MFA_GRACE_DAYS = 7;

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

export const MFA_REQUIRED_ROLES = [
  'admin',
  'school_admin',
  'secretary',
  'accountant',
  'teacher',
  'head_teacher',
  'supervisor',
  'group_owner',
] as const;

/** Rôles volontairement hors obligation (MFA possible, jamais forcée). */
export const MFA_OPTIONAL_ROLES = ['student', 'parent'] as const;

export const isMfaRequiredRole = (role: string): boolean =>
  (MFA_REQUIRED_ROLES as readonly string[]).includes(role);

/** Chemins toujours accessibles sans gate mot de passe / MFA setup. */
export const isAuthRouterExempt = (baseUrl: string): boolean => baseUrl === '/auth';

/** @deprecated alias — préférer `isAuthRouterExempt`. */
export const isMfaSetupExempt = isAuthRouterExempt;

export const computeMfaGraceUntil = (from: Date = new Date()): Date => {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + MFA_GRACE_DAYS);
  return d;
};

export const isMfaGraceExpired = (
  mfaGraceUntil: Date | null | undefined,
  now: Date = new Date()
): boolean => !!mfaGraceUntil && mfaGraceUntil.getTime() <= now.getTime();

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

/**
 * Consomme un code de secours en une seule instruction SQL.
 * Deux POST simultanés : une seule ligne mise à jour (pas de double spend).
 */
export const tryConsumeBackupCode = async (userId: string, code: string): Promise<boolean> => {
  const candidate = hashBackupCode(code);
  const updated = await prisma.$executeRaw`
    UPDATE strk_profiles
    SET mfa_backup_code_hashes = array_remove(mfa_backup_code_hashes, ${candidate})
    WHERE id = ${userId}::uuid
      AND ${candidate} = ANY (mfa_backup_code_hashes)
  `;
  return Number(updated) === 1;
};

/** True si la chaîne ressemble à un code de secours (pas un TOTP à 6 chiffres). */
export const looksLikeBackupCode = (code: string): boolean => {
  const n = normalizeBackupCode(code);
  return n.length >= 8 && n.length <= 16 && !/^\d{6}$/.test(code.trim());
};

/**
 * Gate MFA après expiration de la grâce (hors NODE_ENV=test / CADDYNOTE_TEST_MODE).
 * Si `mfaGraceUntil` est null, ne bloque pas (la grâce sera démarrée au login ou /me).
 */
export const shouldEnforceMfaSetup = (opts: {
  nodeEnv: string | undefined;
  testMode: boolean;
  role: string;
  mfaEnabled: boolean;
  routeBaseUrl: string;
  mfaGraceUntil?: Date | null;
}): boolean => {
  if (opts.nodeEnv === 'test' || opts.testMode) return false;
  if (!isMfaRequiredRole(opts.role)) return false;
  if (isAuthRouterExempt(opts.routeBaseUrl)) return false;
  if (opts.mfaEnabled) return false;
  if (!opts.mfaGraceUntil) return false;
  return isMfaGraceExpired(opts.mfaGraceUntil);
};

/** Gate 1ʳᵉ connexion : mot de passe provisoire à changer (hors `/auth`). */
export const shouldEnforcePasswordChange = (opts: {
  mustChangePassword: boolean;
  routeBaseUrl: string;
}): boolean => opts.mustChangePassword && !isAuthRouterExempt(opts.routeBaseUrl);

/**
 * Démarre la fenêtre de grâce MFA (7 j) au premier login /me si absente.
 * No-op si rôle non sensible, MFA déjà active, ou grâce déjà posée.
 */
export const ensureMfaGraceStarted = async (profile: {
  id: string;
  role: string;
  mfaEnabled: boolean;
  mfaGraceUntil: Date | null;
}): Promise<Date | null> => {
  if (!isMfaRequiredRole(profile.role) || profile.mfaEnabled) return profile.mfaGraceUntil;
  if (profile.mfaGraceUntil) return profile.mfaGraceUntil;
  const until = computeMfaGraceUntil();
  await prisma.strkProfile.update({
    where: { id: profile.id },
    data: { mfaGraceUntil: until },
  });
  return until;
};
