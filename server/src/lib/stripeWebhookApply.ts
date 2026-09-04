import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

export type CheckoutSubscriptionInput = {
  userId: string;
  institutionId?: string | null;
  planId?: string | null;
  planName: string;
  billingCycle: string;
  expiresAt: Date;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
};

export const isStripeEventAlreadyProcessed = async (eventId: string): Promise<boolean> => {
  const row = await prisma.stripeWebhookEvent.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  return Boolean(row);
};

export const markStripeEventProcessed = async (eventId: string, type: string): Promise<void> => {
  try {
    await prisma.stripeWebhookEvent.create({ data: { id: eventId, type } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return;
    }
    throw error;
  }
};

export type PaidStripeInvoiceInput = {
  subscriptionId: string;
  stripeInvoiceId: string;
  amount: number;
  currency: string;
  invoiceUrl?: string | null;
};

/** Idempotent : un `stripeInvoiceId` → une seule ligne (invoice.paid rejoué). */
export const recordPaidStripeInvoice = async (input: PaidStripeInvoiceInput): Promise<void> => {
  try {
    await prisma.billingHistory.create({
      data: {
        subscriptionId: input.subscriptionId,
        stripeInvoiceId: input.stripeInvoiceId,
        amount: input.amount,
        currency: input.currency,
        status: 'paid',
        paymentDate: new Date(),
        invoiceUrl: input.invoiceUrl ?? undefined,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return;
    }
    throw error;
  }
};

/** Idempotent : un `stripeSubscriptionId` → une seule ligne. */
export const upsertPremiumFromCheckout = async (input: CheckoutSubscriptionInput): Promise<void> => {
  const data = {
    userId: input.userId,
    institutionId: input.institutionId ?? null,
    planId: input.planId ?? null,
    plan: input.planName,
    status: 'active',
    billingCycle: input.billingCycle,
    expiresAt: input.expiresAt,
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    lastPaymentDate: new Date(),
    nextBillingDate: input.expiresAt,
    suspendedAt: null,
  };
  await prisma.premiumSubscription.upsert({
    where: { stripeSubscriptionId: input.stripeSubscriptionId },
    create: data,
    update: data,
  });
};
