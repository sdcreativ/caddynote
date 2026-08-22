import type { Request, Response } from 'express';
import Stripe from 'stripe';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { getStripeClient, isStripeConfigured, isStripeWebhookConfigured } from '../lib/stripeClient.js';
import { logAudit } from '../lib/audit.js';
import { markAdmissionFeePaidByProviderRef } from './admissions.routes.js';

/**
 * Remplace l'edge function Supabase `webhook-stripe`. FIN-005 / bonnes
 * pratiques Stripe : la confirmation de paiement ne doit JAMAIS reposer sur
 * le retour navigateur (`success_url`) seul — uniquement sur cet événement
 * signé, vérifié côté serveur via `STRIPE_WEBHOOK_SECRET`.
 *
 * Monté directement dans `index.ts`, AVANT `express.json()`, avec
 * `express.raw({type: 'application/json'})` : la vérification de signature
 * Stripe a besoin du corps brut exact, pas du JSON reparsé.
 */
export const stripeWebhookHandler = async (req: Request, res: Response) => {
  if (!isStripeConfigured() || !isStripeWebhookConfigured()) {
    return res.status(501).send('Stripe webhook non configuré');
  }

  const signature = req.headers['stripe-signature'];
  if (typeof signature !== 'string') {
    return res.status(400).send('Signature manquante');
  }

  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (error) {
    console.error('Signature Stripe webhook invalide:', error);
    return res.status(400).send('Signature invalide');
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const kind = session.metadata?.kind;

        if (kind === 'finance_payment' && session.metadata?.paymentId) {
          const payment = await prisma.strkPayment.findUnique({
            where: { id: session.metadata.paymentId },
            include: { invoice: true },
          });
          if (payment && payment.status === 'pending') {
            await prisma.strkPayment.update({
              where: { id: payment.id },
              data: {
                status: 'paid',
                paidAt: new Date(),
                receiptNumber: `REC-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
                verificationToken: crypto.randomBytes(16).toString('hex'),
                providerRef: session.id,
              },
            });
            const paidSum = await prisma.strkPayment.aggregate({
              where: { invoiceId: payment.invoiceId, status: 'paid' },
              _sum: { amountCents: true },
            });
            const paidCents = paidSum._sum.amountCents ?? 0;
            const status =
              paidCents >= payment.invoice.totalCents
                ? 'paid'
                : paidCents > 0
                  ? 'partially_paid'
                  : payment.invoice.status;
            await prisma.strkInvoice.update({
              where: { id: payment.invoiceId },
              data: { paidCents, status },
            });
            await logAudit({
              institutionId: payment.invoice.institutionId,
              actorId: null,
              action: 'finance.payment.stripe_confirmed',
              targetType: 'payment',
              targetId: payment.id,
              metadata: { invoiceId: payment.invoiceId, sessionId: session.id },
            });
          }
          break;
        }

        if (kind === 'admission_fee') {
          await markAdmissionFeePaidByProviderRef(session.id, 'stripe');
          break;
        }

        const userId = session.metadata?.userId;
        const planId = session.metadata?.planId;
        const billingCycle = session.metadata?.billingCycle ?? 'monthly';
        // ORG-001 : rattache l'abonnement à l'établissement de l'acheteur
        // (propagé depuis POST /subscriptions/checkout-session), pas
        // seulement à son compte personnel.
        const institutionId = session.metadata?.institutionId;
        if (!userId || typeof session.subscription !== 'string' || typeof session.customer !== 'string') break;

        const stripeSub = await getStripeClient().subscriptions.retrieve(session.subscription);
        const plan = planId ? await prisma.subscriptionPlan.findUnique({ where: { id: planId } }) : null;
        const expiresAt = new Date(stripeSub.items.data[0]?.current_period_end * 1000 || Date.now());

        await prisma.premiumSubscription.create({
          data: {
            userId,
            institutionId,
            planId: plan?.id,
            plan: plan?.name ?? 'stripe',
            status: 'active',
            billingCycle,
            expiresAt,
            stripeCustomerId: session.customer,
            stripeSubscriptionId: session.subscription,
            lastPaymentDate: new Date(),
            nextBillingDate: expiresAt,
          },
        });
        break;
      }

      case 'customer.subscription.updated': {
        const stripeSub = event.data.object as Stripe.Subscription;
        const local = await prisma.premiumSubscription.findFirst({ where: { stripeSubscriptionId: stripeSub.id } });
        if (!local) break;
        const expiresAt = new Date((stripeSub.items.data[0]?.current_period_end ?? 0) * 1000);
        await prisma.premiumSubscription.update({
          where: { id: local.id },
          data: {
            status: stripeSub.status === 'active' ? 'active' : stripeSub.status,
            expiresAt: expiresAt.getTime() > 0 ? expiresAt : local.expiresAt,
            nextBillingDate: expiresAt.getTime() > 0 ? expiresAt : local.nextBillingDate,
            autoRenew: !stripeSub.cancel_at_period_end,
          },
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const stripeSub = event.data.object as Stripe.Subscription;
        const local = await prisma.premiumSubscription.findFirst({ where: { stripeSubscriptionId: stripeSub.id } });
        if (!local) break;
        await prisma.premiumSubscription.update({ where: { id: local.id }, data: { status: 'cancelled', autoRenew: false } });
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = (invoice as unknown as { subscription?: string }).subscription;
        if (!subId) break;
        const local = await prisma.premiumSubscription.findFirst({ where: { stripeSubscriptionId: subId } });
        if (!local) break;
        await prisma.billingHistory.create({
          data: {
            subscriptionId: local.id,
            stripeInvoiceId: invoice.id,
            amount: (invoice.amount_paid ?? 0) / 100,
            currency: invoice.currency?.toUpperCase() ?? 'EUR',
            status: 'paid',
            paymentDate: new Date(),
            invoiceUrl: invoice.hosted_invoice_url ?? undefined,
          },
        });
        break;
      }

      default:
        break;
    }
    res.json({ received: true });
  } catch (error) {
    console.error('Erreur traitement webhook Stripe:', error);
    res.status(500).send('Erreur interne');
  }
};
