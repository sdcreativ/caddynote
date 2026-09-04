-- Rejeu checkout.session.completed : une ligne par abonnement Stripe,
-- et un registre des event.id déjà traités.

CREATE TABLE IF NOT EXISTS "stripe_webhook_events" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

-- Conservé : la ligne la plus récente. Les doublons perdent leurs
-- historiques (ON DELETE CASCADE sur billing_history / notifications).
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY stripe_subscription_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC, id DESC
    ) AS rn
  FROM premium_subscriptions
  WHERE stripe_subscription_id IS NOT NULL
)
DELETE FROM premium_subscriptions p
USING ranked r
WHERE p.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "premium_subscriptions_stripe_subscription_id_key"
  ON "premium_subscriptions" ("stripe_subscription_id");
