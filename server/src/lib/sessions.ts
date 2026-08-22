import { prisma } from './prisma.js';

/**
 * IAM-004 : gestion des sessions. Un jeton JWT est par nature stateless (le
 * serveur ne peut pas le "reprendre" avant son expiration) — la seule façon
 * d'offrir une révocation réelle est de faire porter au jeton l'id d'une
 * ligne côté serveur (`StrkSession`, claim `sid`) que chaque requête
 * authentifiée vérifie encore valide (cf. `middleware/auth.ts`). C'est un
 * compromis assumé : chaque requête authentifiée coûte une lecture DB
 * supplémentaire, en échange d'une révocation immédiate (déconnexion à
 * distance, "se déconnecter partout").
 */

const DURATION_RE = /^(\d+)(s|m|h|d)?$/;

/** Convertit une chaîne de durée façon `jsonwebtoken` ("7d", "3600", "30m")
 * en date d'expiration. Reproduit ici en local plutôt que d'ajouter une
 * dépendance juste pour ça — le format accepté est volontairement simple. */
export const computeExpiry = (spec: string, from: Date = new Date()): Date => {
  const match = DURATION_RE.exec(spec.trim());
  if (!match) {
    // Valeur non reconnue : repli sur 7 jours plutôt que de faire planter
    // l'émission d'un jeton pour une variable d'environnement mal formée.
    return new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  const value = Number(match[1]);
  const unitMs: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  const unit = match[2] ?? 's';
  return new Date(from.getTime() + value * unitMs[unit]);
};

export interface CreateSessionParams {
  userId: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  /** Durée façon JWT ("15m", "1h") — défaut JWT_EXPIRES_IN. */
  expiresIn?: string;
}

/** Crée la session servant de base à un nouveau jeton d'accès (register,
 * login, vérification MFA — un jeton = une session). */
export const createSession = async (params: CreateSessionParams) => {
  const expiresAt = computeExpiry(params.expiresIn || process.env.JWT_EXPIRES_IN || '7d');
  return prisma.strkSession.create({
    data: {
      userId: params.userId,
      userAgent: params.userAgent?.slice(0, 500),
      ipAddress: params.ipAddress,
      expiresAt,
    },
  });
};

/** Vérifie qu'une session est encore valide (existe, non révoquée, non
 * expirée) — appelé par `requireAuth` à chaque requête. Met aussi à jour
 * `lastSeenAt` en best-effort (jamais bloquant : une requête authentifiée
 * ne doit pas échouer à cause d'un souci d'écriture sur ce champ annexe). */
export const isSessionValid = async (sessionId: string): Promise<boolean> => {
  const session = await prisma.strkSession.findUnique({ where: { id: sessionId } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    return false;
  }
  prisma.strkSession.update({ where: { id: sessionId }, data: { lastSeenAt: new Date() } }).catch(() => {});
  return true;
};
