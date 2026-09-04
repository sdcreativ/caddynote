import { prisma } from './prisma.js';
import { isHardenedRuntime } from './deployment.js';

/**
 * IAM-004 : gestion des sessions. Un jeton JWT est par nature stateless (le
 * serveur ne peut pas le "reprendre" avant son expiration) — la seule façon
 * d'offrir une révocation réelle est de faire porter au jeton l'id d'une
 * ligne côté serveur (`StrkSession`, claim `sid`) que chaque requête
 * authentifiée vérifie encore valide (cf. `middleware/auth.ts`).
 */

const DURATION_RE = /^(\d+)(s|m|h|d)?$/;
const DEFAULT_EXPIRES_IN = '12h';
const MAX_DEPLOYED_MS = 24 * 60 * 60 * 1000;

/** Durée en ms d’une spec `jsonwebtoken` simple ("12h", "30m", "7d"). */
export const durationSpecToMs = (spec: string): number | null => {
  const match = DURATION_RE.exec(spec.trim());
  if (!match) return null;
  const value = Number(match[1]);
  const unitMs: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  const unit = match[2] ?? 's';
  return value * unitMs[unit];
};

/**
 * Durée d’accès effective : défaut 12h ; en staging/production, plafond 24h.
 */
export const resolveAccessTokenExpiresIn = (explicit?: string): string => {
  const raw = (explicit || process.env.JWT_EXPIRES_IN || DEFAULT_EXPIRES_IN).trim();
  const ms = durationSpecToMs(raw);
  if (ms == null) {
    console.warn(`JWT_EXPIRES_IN invalide (« ${raw} ») — repli sur ${DEFAULT_EXPIRES_IN}`);
    return DEFAULT_EXPIRES_IN;
  }
  if (isHardenedRuntime() && ms > MAX_DEPLOYED_MS) {
    console.warn(
      `JWT_EXPIRES_IN=${raw} dépasse 24h en staging/production — clamp à 24h`
    );
    return '24h';
  }
  return raw;
};

export const computeExpiry = (spec: string, from: Date = new Date()): Date => {
  const resolved = resolveAccessTokenExpiresIn(spec);
  const ms = durationSpecToMs(resolved) ?? 12 * 60 * 60 * 1000;
  return new Date(from.getTime() + ms);
};

export interface CreateSessionParams {
  userId: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  /** Durée façon JWT ("15m", "1h") — défaut JWT_EXPIRES_IN / 12h. */
  expiresIn?: string;
}

export const createSession = async (params: CreateSessionParams) => {
  const expiresAt = computeExpiry(params.expiresIn || resolveAccessTokenExpiresIn());
  return prisma.strkSession.create({
    data: {
      userId: params.userId,
      userAgent: params.userAgent?.slice(0, 500),
      ipAddress: params.ipAddress,
      expiresAt,
    },
  });
};

export const isSessionValid = async (sessionId: string): Promise<boolean> => {
  const session = await prisma.strkSession.findUnique({ where: { id: sessionId } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    return false;
  }
  prisma.strkSession.update({ where: { id: sessionId }, data: { lastSeenAt: new Date() } }).catch(() => {});
  return true;
};

/** Invalide tous les JWT encore en circulation (claim `sid`). */
export const revokeActiveSessions = async (userId: string): Promise<number> => {
  const result = await prisma.strkSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
};
