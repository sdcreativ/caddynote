import { prisma } from './prisma.js';

/**
 * FIN-007 : rapprochement bancaire. Chaque ligne de relevé importée est
 * confrontée aux paiements confirmés (`StrkPayment.status === 'paid'`) du
 * même établissement — jamais l'inverse (le relevé bancaire ne modifie
 * jamais un paiement, il ne fait que s'y référer).
 *
 * Rapprochement automatique volontairement prudent : ne matche que s'il
 * trouve UN SEUL paiement candidat (même montant, date à quelques jours
 * près, pas déjà rapproché par une autre ligne) — en cas d'ambiguïté
 * (plusieurs candidats) ou d'absence de candidat, la ligne reste
 * "unmatched" pour un rapprochement manuel plutôt qu'un mauvais matching
 * automatique qui associerait silencieusement le mauvais paiement.
 */

const DEFAULT_MATCH_WINDOW_DAYS = 5;

const withinDays = (a: Date, b: Date, days: number): boolean => Math.abs(a.getTime() - b.getTime()) <= days * 24 * 60 * 60 * 1000;

/** Tente un rapprochement automatique pour une ligne encore "unmatched".
 * Retourne `true` si un match a été posé. */
export const attemptAutoMatch = async (lineId: string): Promise<boolean> => {
  const line = await prisma.strkBankStatementLine.findUnique({ where: { id: lineId } });
  if (!line || line.status !== 'unmatched') return false;

  const alreadyMatched = await prisma.strkBankStatementLine.findMany({
    where: { status: 'matched', matchedPaymentId: { not: null } },
    select: { matchedPaymentId: true },
  });
  const excludedPaymentIds = alreadyMatched.map((l) => l.matchedPaymentId!);

  const candidates = await prisma.strkPayment.findMany({
    where: {
      amountCents: line.amountCents,
      status: 'paid',
      id: { notIn: excludedPaymentIds },
      invoice: { institutionId: line.institutionId },
    },
    select: { id: true, paidAt: true },
  });
  const withinWindow = candidates.filter((p) => p.paidAt && withinDays(p.paidAt, line.date, DEFAULT_MATCH_WINDOW_DAYS));
  if (withinWindow.length !== 1) return false;

  await prisma.strkBankStatementLine.update({
    where: { id: line.id },
    data: { status: 'matched', matchedPaymentId: withinWindow[0].id, matchedAt: new Date() },
  });
  return true;
};

export interface ImportedLineInput {
  date: Date;
  amountCents: number;
  currency?: string;
  label: string;
  externalRef?: string;
}

/** Importe un lot de lignes de relevé et tente un rapprochement automatique
 * pour chacune, dans l'ordre — une ligne déjà matchée par une précédente de
 * ce même lot n'est jamais reproposée à une ligne suivante (la garde
 * `alreadyMatched` d'`attemptAutoMatch` relit systématiquement l'état à
 * jour en base, pas un instantané figé avant la boucle). */
export const importBankStatementLines = async (params: {
  institutionId: string;
  importedBy: string;
  lines: ImportedLineInput[];
}): Promise<{ imported: number; autoMatched: number; lineIds: string[] }> => {
  const lineIds: string[] = [];
  for (const line of params.lines) {
    const row = await prisma.strkBankStatementLine.create({
      data: {
        institutionId: params.institutionId,
        date: line.date,
        amountCents: line.amountCents,
        currency: line.currency ?? 'XOF',
        label: line.label,
        externalRef: line.externalRef,
        importedBy: params.importedBy,
      },
    });
    lineIds.push(row.id);
  }

  let autoMatched = 0;
  for (const id of lineIds) {
    if (await attemptAutoMatch(id)) autoMatched += 1;
  }

  return { imported: lineIds.length, autoMatched, lineIds };
};
