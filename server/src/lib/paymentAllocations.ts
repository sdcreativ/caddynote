/**
 * Lot 5.4 — imputation d’encaissements (1 paiement → N factures).
 * `StrkPayment.invoiceId` reste la facture d’ancrage (reçus / webhooks).
 * `paidCents` facture = somme des allocations des paiements `paid`.
 */
import { prisma } from './prisma.js';

export class PaymentAllocationError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = 'allocation_invalid') {
    super(message);
    this.name = 'PaymentAllocationError';
    this.status = status;
    this.code = code;
  }
}

export type AllocationLine = { invoiceId: string; amountCents: number };

/** Solde restant dû (cash + avoirs déjà imputés). */
export const invoiceRemainingCents = (invoice: {
  totalCents: number;
  paidCents: number;
  creditAppliedCents: number;
  status: string;
}): number => {
  if (invoice.status === 'cancelled') return 0;
  return Math.max(0, invoice.totalCents - invoice.paidCents - invoice.creditAppliedCents);
};

export const invoiceStatusFromCoverage = (
  totalCents: number,
  paidCents: number,
  creditAppliedCents: number
): string => {
  const covered = paidCents + creditAppliedCents;
  if (covered <= 0) return 'issued';
  if (covered >= totalCents) return 'paid';
  return 'partially_paid';
};

/** Recalcule paidCents (+ conserve creditAppliedCents) et le statut. */
export const recomputeInvoiceStatus = async (invoiceId: string): Promise<void> => {
  const invoice = await prisma.strkInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
  const paidAgg = await prisma.strkPaymentAllocation.aggregate({
    where: { invoiceId, payment: { status: 'paid' } },
    _sum: { amountCents: true },
  });
  const paidCents = paidAgg._sum.amountCents ?? 0;
  const creditAppliedCents = invoice.creditAppliedCents;
  const status =
    invoice.status === 'cancelled'
      ? 'cancelled'
      : invoiceStatusFromCoverage(invoice.totalCents, paidCents, creditAppliedCents);
  await prisma.strkInvoice.update({
    where: { id: invoiceId },
    data: { paidCents, status },
  });
};

export const recomputeInvoicesStatus = async (invoiceIds: string[]): Promise<void> => {
  const unique = [...new Set(invoiceIds)];
  for (const id of unique) {
    await recomputeInvoiceStatus(id);
  }
};

export type ManualMultiPaymentInput = {
  institutionId: string;
  actorId: string;
  method: 'cash' | 'bank_transfer';
  currency?: string;
  allocations: AllocationLine[];
  receiptNumber: string;
  verificationToken: string;
};

/**
 * Enregistre un paiement manuel ventilé sur N factures (même établissement).
 */
export const createManualMultiPayment = async (input: ManualMultiPaymentInput) => {
  const lines = input.allocations.filter((a) => a.amountCents > 0);
  if (lines.length === 0) {
    throw new PaymentAllocationError('Au moins une imputation positive est requise');
  }

  const totalCents = lines.reduce((s, a) => s + a.amountCents, 0);
  const invoiceIds = lines.map((a) => a.invoiceId);
  if (new Set(invoiceIds).size !== invoiceIds.length) {
    throw new PaymentAllocationError('Chaque facture ne peut apparaître qu’une fois');
  }

  const invoices = await prisma.strkInvoice.findMany({
    where: { id: { in: invoiceIds } },
  });
  if (invoices.length !== invoiceIds.length) {
    throw new PaymentAllocationError('Facture introuvable', 404, 'invoice_not_found');
  }

  const currency = input.currency || invoices[0]!.currency;
  for (const inv of invoices) {
    if (inv.institutionId !== input.institutionId) {
      throw new PaymentAllocationError('Permissions insuffisantes', 403, 'forbidden');
    }
    if (inv.status === 'cancelled') {
      throw new PaymentAllocationError(`Facture ${inv.invoiceNumber} annulée`);
    }
    if (inv.currency !== currency) {
      throw new PaymentAllocationError('Toutes les factures doivent partager la même devise');
    }
  }

  const byId = new Map(invoices.map((i) => [i.id, i]));
  for (const line of lines) {
    const inv = byId.get(line.invoiceId)!;
    const remaining = invoiceRemainingCents(inv);
    if (line.amountCents > remaining) {
      throw new PaymentAllocationError(
        `Montant trop élevé pour ${inv.invoiceNumber} (reste ${remaining} centimes)`
      );
    }
  }

  const anchorInvoiceId = lines[0]!.invoiceId;

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.strkPayment.create({
      data: {
        invoiceId: anchorInvoiceId,
        amountCents: totalCents,
        currency,
        method: input.method,
        status: 'paid',
        provider: 'manual',
        paidBy: input.actorId,
        paidAt: new Date(),
        receiptNumber: input.receiptNumber,
        verificationToken: input.verificationToken,
      },
    });
    await tx.strkPaymentAllocation.createMany({
      data: lines.map((l) => ({
        paymentId: created.id,
        invoiceId: l.invoiceId,
        amountCents: l.amountCents,
      })),
    });
    return created;
  });

  await recomputeInvoicesStatus(invoiceIds);
  const allocations = await prisma.strkPaymentAllocation.findMany({
    where: { paymentId: payment.id },
  });
  return { payment, allocations };
};

/** Crée l’allocation 1:1 pour un paiement mono-facture (manuel ou online). */
export const ensureSingleAllocation = async (
  paymentId: string,
  invoiceId: string,
  amountCents: number
): Promise<void> => {
  const existing = await prisma.strkPaymentAllocation.findFirst({
    where: { paymentId },
  });
  if (existing) return;
  await prisma.strkPaymentAllocation.create({
    data: { paymentId, invoiceId, amountCents },
  });
};
