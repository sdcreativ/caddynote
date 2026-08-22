import { prisma } from './prisma.js';

/**
 * IAM-005 : journal d'audit. Écrit uniquement depuis le code serveur
 * lui-même (aucune route HTTP n'expose d'écriture) — c'est ce qui le rend
 * fiable, à la différence de `StrkActivity` (`POST /activity`), un flux
 * d'activité alimenté par le client, donc falsifiable ou tout simplement
 * omissible si personne n'a pensé à l'appeler côté frontend.
 *
 * Couverture volontairement ciblée sur les actions les plus sensibles
 * signalées par l'audit (finance, accès/sécurité) plutôt qu'une
 * instrumentation mécanique de chaque route mutante de l'application —
 * périmètre exact documenté dans `docs/AUDIT_CAHIER_DES_CHARGES_CaddyNote.md`
 * §4.3 IAM-005.
 */
export interface AuditEntry {
  institutionId?: string | null;
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

/** N'échoue jamais bruyamment : une panne de journalisation ne doit jamais
 * faire échouer l'action métier qu'elle accompagne — l'erreur est seulement
 * journalisée en console, jamais propagée à l'appelant.
 *
 * Awaited (pas "fire-and-forget") : une trace d'audit n'a de valeur que si
 * elle est garantie écrite avant que la réponse ne parte — sinon un crash
 * du process juste après l'envoi de la réponse pourrait faire disparaître
 * silencieusement l'entrée. Le coût (une insertion de plus par action
 * sensible) est accepté pour cette garantie ; les appelants doivent faire
 * `await logAudit(...)`. */
export const logAudit = async (entry: AuditEntry): Promise<void> => {
  try {
    await prisma.strkAuditLog.create({
      data: {
        institutionId: entry.institutionId ?? null,
        actorId: entry.actorId ?? null,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        metadata: entry.metadata as any,
        ipAddress: entry.ipAddress ?? null,
      },
    });
  } catch (error) {
    console.error(`Échec d'écriture du journal d'audit (action="${entry.action}") :`, error);
  }
};
