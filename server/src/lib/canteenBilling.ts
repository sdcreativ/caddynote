/**
 * Facturation cantine (Lot 9 / S1) — une inscription payante → une facture.
 */
import crypto from 'node:crypto';
import type { Prisma, StrkCanteenPlan, StrkCanteenSubscription, StrkInvoice } from '@prisma/client';
import { prisma } from './prisma.js';

export const generateInvoiceNumber = (): string =>
  `INV-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

type Tx = Prisma.TransactionClient;

export type CanteenInvoiceResult = {
  subscription: StrkCanteenSubscription;
  invoice: StrkInvoice | null;
};

/** Crée la facture liée si le plan a un prix > 0 et qu’aucune facture n’existe. */
export const ensureCanteenInvoice = async (
  params: {
    subscription: StrkCanteenSubscription;
    plan: StrkCanteenPlan;
    actorId: string;
  },
  tx: Tx = prisma
): Promise<StrkInvoice | null> => {
  if (params.subscription.invoiceId) {
    return tx.strkInvoice.findUnique({ where: { id: params.subscription.invoiceId } });
  }
  if (params.plan.priceCents <= 0) {
    return null;
  }

  const invoice = await tx.strkInvoice.create({
    data: {
      institutionId: params.plan.institutionId,
      studentId: params.subscription.studentId,
      invoiceNumber: generateInvoiceNumber(),
      totalCents: params.plan.priceCents,
      currency: params.plan.currency || 'XOF',
      createdBy: params.actorId,
      lines: {
        create: [
          {
            label: `Cantine — ${params.plan.name}`,
            amountCents: params.plan.priceCents,
            quantity: 1,
            lineType: 'fee',
          },
        ],
      },
    },
  });

  await tx.strkCanteenSubscription.update({
    where: { id: params.subscription.id },
    data: { invoiceId: invoice.id },
  });

  return invoice;
};

export const subscribeStudentToCanteenPlan = async (params: {
  plan: StrkCanteenPlan;
  studentId: string;
  actorId: string;
}): Promise<CanteenInvoiceResult> => {
  return prisma.$transaction(async (tx) => {
    const subscription = await tx.strkCanteenSubscription.create({
      data: { planId: params.plan.id, studentId: params.studentId },
    });
    const invoice = await ensureCanteenInvoice(
      { subscription, plan: params.plan, actorId: params.actorId },
      tx
    );
    const refreshed = invoice
      ? await tx.strkCanteenSubscription.findUniqueOrThrow({ where: { id: subscription.id } })
      : subscription;
    return { subscription: refreshed, invoice };
  });
};
