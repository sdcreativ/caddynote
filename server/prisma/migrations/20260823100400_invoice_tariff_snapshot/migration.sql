-- Lot 1 / 5 : snapshot tarifaire sur factures / lignes / plans de paiement élève

ALTER TABLE "strk_invoices"
  ADD COLUMN IF NOT EXISTS "fee_schedule_id" UUID,
  ADD COLUMN IF NOT EXISTS "fee_schedule_version" INTEGER,
  ADD COLUMN IF NOT EXISTS "tariff_snapshot" JSONB;

CREATE INDEX IF NOT EXISTS "strk_invoices_fee_schedule_id_idx"
  ON "strk_invoices"("fee_schedule_id");

DO $$ BEGIN
  ALTER TABLE "strk_invoices"
    ADD CONSTRAINT "strk_invoices_fee_schedule_id_fkey"
    FOREIGN KEY ("fee_schedule_id") REFERENCES "strk_fee_schedules"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "strk_invoice_lines"
  ADD COLUMN IF NOT EXISTS "fee_type_code" TEXT,
  ADD COLUMN IF NOT EXISTS "fee_origin" TEXT,
  ADD COLUMN IF NOT EXISTS "fee_schedule_item_id" UUID;

CREATE INDEX IF NOT EXISTS "strk_invoice_lines_fee_schedule_item_id_idx"
  ON "strk_invoice_lines"("fee_schedule_item_id");

DO $$ BEGIN
  ALTER TABLE "strk_invoice_lines"
    ADD CONSTRAINT "strk_invoice_lines_fee_schedule_item_id_fkey"
    FOREIGN KEY ("fee_schedule_item_id") REFERENCES "strk_fee_schedule_items"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "strk_payment_plans"
  ADD COLUMN IF NOT EXISTS "fee_schedule_id" UUID,
  ADD COLUMN IF NOT EXISTS "plan_template_id" UUID;

CREATE INDEX IF NOT EXISTS "strk_payment_plans_fee_schedule_id_idx"
  ON "strk_payment_plans"("fee_schedule_id");

CREATE INDEX IF NOT EXISTS "strk_payment_plans_plan_template_id_idx"
  ON "strk_payment_plans"("plan_template_id");

DO $$ BEGIN
  ALTER TABLE "strk_payment_plans"
    ADD CONSTRAINT "strk_payment_plans_fee_schedule_id_fkey"
    FOREIGN KEY ("fee_schedule_id") REFERENCES "strk_fee_schedules"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "strk_payment_plans"
    ADD CONSTRAINT "strk_payment_plans_plan_template_id_fkey"
    FOREIGN KEY ("plan_template_id") REFERENCES "strk_fee_plan_templates"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
