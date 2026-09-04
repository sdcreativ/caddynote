import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { buildFixture, type Fixture } from './fixtures.js';
import {
  isStripeEventAlreadyProcessed,
  markStripeEventProcessed,
  recordPaidStripeInvoice,
  upsertPremiumFromCheckout,
} from '../lib/stripeWebhookApply.js';

describe('Webhook Stripe — idempotence checkout', () => {
  const stripeSubId = `sub_test_idem_${Date.now()}`;
  const eventId = `evt_test_idem_${Date.now()}`;
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30_000);

  afterAll(async () => {
    await prisma.billingHistory.deleteMany({
      where: { stripeInvoiceId: { startsWith: 'in_test_idem_' } },
    });
    await prisma.premiumSubscription.deleteMany({ where: { stripeSubscriptionId: stripeSubId } });
    await prisma.stripeWebhookEvent.deleteMany({ where: { id: eventId } });
  });

  it('upsertPremiumFromCheckout ne crée qu’une ligne pour le même stripeSubscriptionId', async () => {
    const expiresAt = new Date(Date.now() + 30 * 86400000);
    const payload = {
      userId: fx.a.schoolAdmin.id,
      institutionId: fx.a.institutionId,
      planName: 'stripe',
      billingCycle: 'monthly',
      expiresAt,
      stripeCustomerId: 'cus_test_idem',
      stripeSubscriptionId: stripeSubId,
    };

    await upsertPremiumFromCheckout(payload);
    await upsertPremiumFromCheckout({ ...payload, planName: 'stripe-replay' });

    const rows = await prisma.premiumSubscription.findMany({
      where: { stripeSubscriptionId: stripeSubId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].plan).toBe('stripe-replay');
    expect(rows[0].status).toBe('active');
  });

  it('mémorise event.id et ignore un second passage', async () => {
    expect(await isStripeEventAlreadyProcessed(eventId)).toBe(false);
    await markStripeEventProcessed(eventId, 'checkout.session.completed');
    await markStripeEventProcessed(eventId, 'checkout.session.completed');
    expect(await isStripeEventAlreadyProcessed(eventId)).toBe(true);

    const rows = await prisma.stripeWebhookEvent.findMany({ where: { id: eventId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('checkout.session.completed');
  });

  it('recordPaidStripeInvoice n’écrit qu’une ligne pour le même stripeInvoiceId', async () => {
    const expiresAt = new Date(Date.now() + 30 * 86400000);
    await upsertPremiumFromCheckout({
      userId: fx.a.schoolAdmin.id,
      institutionId: fx.a.institutionId,
      planName: 'stripe',
      billingCycle: 'monthly',
      expiresAt,
      stripeCustomerId: 'cus_test_idem',
      stripeSubscriptionId: stripeSubId,
    });
    const sub = await prisma.premiumSubscription.findUniqueOrThrow({
      where: { stripeSubscriptionId: stripeSubId },
    });
    const invoiceId = `in_test_idem_${Date.now()}`;
    const payload = {
      subscriptionId: sub.id,
      stripeInvoiceId: invoiceId,
      amount: 49,
      currency: 'EUR',
      invoiceUrl: 'https://invoice.stripe.test/in_test',
    };

    await recordPaidStripeInvoice(payload);
    await recordPaidStripeInvoice({ ...payload, amount: 99 });

    const rows = await prisma.billingHistory.findMany({ where: { stripeInvoiceId: invoiceId } });
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount)).toBe(49);
    expect(rows[0].status).toBe('paid');
  });

  it('recordPaidStripeInvoice crée une ligne par stripeInvoiceId distinct', async () => {
    await upsertPremiumFromCheckout({
      userId: fx.a.schoolAdmin.id,
      institutionId: fx.a.institutionId,
      planName: 'stripe',
      billingCycle: 'monthly',
      expiresAt: new Date(Date.now() + 30 * 86400000),
      stripeCustomerId: 'cus_test_idem',
      stripeSubscriptionId: stripeSubId,
    });
    const sub = await prisma.premiumSubscription.findUniqueOrThrow({
      where: { stripeSubscriptionId: stripeSubId },
    });
    const firstId = `in_test_idem_${Date.now()}_a`;
    const secondId = `in_test_idem_${Date.now()}_b`;

    await recordPaidStripeInvoice({
      subscriptionId: sub.id,
      stripeInvoiceId: firstId,
      amount: 10,
      currency: 'EUR',
    });
    await recordPaidStripeInvoice({
      subscriptionId: sub.id,
      stripeInvoiceId: secondId,
      amount: 20,
      currency: 'EUR',
    });

    const rows = await prisma.billingHistory.findMany({
      where: { stripeInvoiceId: { in: [firstId, secondId] } },
      orderBy: { amount: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(Number(rows[0].amount)).toBe(10);
    expect(Number(rows[1].amount)).toBe(20);
  });
});
