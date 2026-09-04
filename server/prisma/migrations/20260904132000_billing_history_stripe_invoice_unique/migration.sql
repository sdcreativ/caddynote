-- Un stripe_invoice_id → une ligne (invoice.paid sous un autre event.id).
-- Les NULL restent autorisés (plusieurs lignes hors Stripe).

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY stripe_invoice_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM billing_history
  WHERE stripe_invoice_id IS NOT NULL
)
DELETE FROM billing_history b
USING ranked r
WHERE b.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "billing_history_stripe_invoice_id_key"
  ON "billing_history" ("stripe_invoice_id");
