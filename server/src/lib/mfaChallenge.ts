/**
 * Défi MFA à usage unique : le JWT 5 min ne suffit pas — un TOTP encore
 * valide dans la fenêtre ±30 s rejouerait sinon le même challenge.
 * Un `jti` hashé par utilisateur ; consommé seulement après un code correct
 * (un essai faux ne force pas à se reconnecter).
 */
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from './prisma.js';
import { signMfaChallengeToken, verifyMfaChallengeToken } from './jwt.js';

export const MFA_CHALLENGE_CATEGORY = 'mfa_challenge';
const HASH_PREFIX = 'caddynote-mfa-challenge:';
export const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export const hashMfaChallengeJti = (jti: string): string =>
  createHash('sha256').update(`${HASH_PREFIX}${jti}`).digest('hex');

export const issueMfaChallengeToken = async (userId: string): Promise<string> => {
  const jti = randomBytes(16).toString('hex');
  const value = {
    jtiHash: hashMfaChallengeJti(jti),
    exp: Date.now() + MFA_CHALLENGE_TTL_MS,
  };
  await prisma.strkSetting.upsert({
    where: { category_key: { category: MFA_CHALLENGE_CATEGORY, key: userId } },
    create: {
      category: MFA_CHALLENGE_CATEGORY,
      key: userId,
      value,
      description: 'MFA challenge jti (TTL court, usage unique)',
      isPublic: false,
    },
    update: { value, isPublic: false },
  });
  return signMfaChallengeToken(userId, jti);
};

/** Vérifie la signature sans consommer (réessais TOTP sur le même défi). */
export const peekMfaChallengeToken = (token: string): { sub: string; jti: string } =>
  verifyMfaChallengeToken(token);

/** Une seule consommation réussie par `jti` (courses parallèles → un seul 200). */
export const consumeMfaChallengeJti = async (userId: string, jti: string): Promise<boolean> => {
  if (!jti || jti.length < 16 || jti.length > 128) return false;
  const hash = hashMfaChallengeJti(jti);
  const now = Date.now();
  const deleted = await prisma.$executeRaw`
    DELETE FROM strk_settings
    WHERE category = ${MFA_CHALLENGE_CATEGORY}
      AND key = ${userId}
      AND value->>'jtiHash' = ${hash}
      AND COALESCE((value->>'exp')::bigint, 0) > ${now}
  `;
  return Number(deleted) === 1;
};
