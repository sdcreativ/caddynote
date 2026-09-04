/**
 * Jeton de reset MDP : secret uniquement dans l’e-mail (fragment d’URL).
 * En base : SHA-256. Un dump DB ne suffit plus à réinitialiser un compte.
 */
import crypto from 'node:crypto';

const HASH_PREFIX = 'caddynote-pwd-reset:';
/** Distingue un hash stocké d’un ancien jeton hex en clair (64 chars). */
export const RESET_TOKEN_STORE_PREFIX = 'sha256:';

export const hashPasswordResetToken = (raw: string): string =>
  `${RESET_TOKEN_STORE_PREFIX}${crypto.createHash('sha256').update(`${HASH_PREFIX}${raw}`).digest('hex')}`;

export const issuePasswordResetSecret = (): { raw: string; hash: string } => {
  const raw = crypto.randomBytes(32).toString('base64url');
  return { raw, hash: hashPasswordResetToken(raw) };
};

export const buildResetPasswordUrl = (appUrl: string, raw: string): string =>
  `${appUrl.replace(/\/$/, '')}/reset-password#token=${encodeURIComponent(raw)}`;

export const extractResetTokenFromUrl = (text: string): string | null => {
  const hashMatch = text.match(/#token=([^&\s"'<>]+)/);
  if (hashMatch) return decodeURIComponent(hashMatch[1]);
  return null;
};

/** Ancien format (hex 32 octets) encore valable 1 h après déploiement. */
export const isLegacyPlainResetToken = (raw: string): boolean => /^[a-f0-9]{64}$/i.test(raw);
