/**
 * Idempotence des commandes sensibles (Lot 3 grille financière).
 * Clé lue depuis l’en-tête `Idempotency-Key`, retracée via `StrkAuditLog`
 * (pas de nouvelle table). Une rejoue avec la même clé renvoie la cible
 * déjà traitée plutôt que de re-exécuter l’effet.
 */
import { prisma } from './prisma.js';

export function readIdempotencyKey(headerValue: unknown): string | null {
  if (typeof headerValue !== 'string') return null;
  const key = headerValue.trim();
  if (!key || key.length > 128) return null;
  return key;
}

export async function findIdempotentAudit(params: {
  institutionId: string;
  action: string;
  idempotencyKey: string;
}) {
  return prisma.strkAuditLog.findFirst({
    where: {
      institutionId: params.institutionId,
      action: params.action,
      metadata: { path: ['idempotencyKey'], equals: params.idempotencyKey },
    },
    orderBy: { createdAt: 'desc' },
  });
}
