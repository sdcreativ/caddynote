-- Rollback manuel Lot 1 / 5 (conserve les données factures/paiements existantes)

ALTER TABLE "strk_payment_plans" DROP CONSTRAINT IF EXISTS "strk_payment_plans_plan_template_id_fkey";
ALTER TABLE "strk_payment_plans" DROP CONSTRAINT IF EXISTS "strk_payment_plans_fee_schedule_id_fkey";
DROP INDEX IF EXISTS "strk_payment_plans_plan_template_id_idx";
DROP INDEX IF EXISTS "strk_payment_plans_fee_schedule_id_idx";
ALTER TABLE "strk_payment_plans"
  DROP COLUMN IF EXISTS "plan_template_id",
  DROP COLUMN IF EXISTS "fee_schedule_id";

ALTER TABLE "strk_invoice_lines" DROP CONSTRAINT IF EXISTS "strk_invoice_lines_fee_schedule_item_id_fkey";
DROP INDEX IF EXISTS "strk_invoice_lines_fee_schedule_item_id_idx";
ALTER TABLE "strk_invoice_lines"
  DROP COLUMN IF EXISTS "fee_schedule_item_id",
  DROP COLUMN IF EXISTS "fee_origin",
  DROP COLUMN IF EXISTS "fee_type_code";

ALTER TABLE "strk_invoices" DROP CONSTRAINT IF EXISTS "strk_invoices_fee_schedule_id_fkey";
DROP INDEX IF EXISTS "strk_invoices_fee_schedule_id_idx";
ALTER TABLE "strk_invoices"
  DROP COLUMN IF EXISTS "tariff_snapshot",
  DROP COLUMN IF EXISTS "fee_schedule_version",
  DROP COLUMN IF EXISTS "fee_schedule_id";
