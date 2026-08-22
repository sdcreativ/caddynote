import Stripe from 'stripe';
import { areExternalServicesDisabled } from './testMode.js';

/**
 * Stripe pour l'abonnement SaaS établissement ↔ SDCREATIV (chap. 23, distinct
 * du module Finance frais de scolarité qui utilise CinetPay/Mobile Money —
 * voir `lib/cinetpay.ts`). Remplace les edge functions Supabase
 * `create-checkout-session`, `create-customer-portal` et `webhook-stripe`.
 */

let client: Stripe | null = null;

export const isStripeConfigured = (): boolean =>
  !areExternalServicesDisabled() && !!process.env.STRIPE_SECRET_KEY;
export const isStripeWebhookConfigured = (): boolean =>
  !areExternalServicesDisabled() && !!process.env.STRIPE_WEBHOOK_SECRET;

export const getStripeClient = (): Stripe => {
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return client;
};
