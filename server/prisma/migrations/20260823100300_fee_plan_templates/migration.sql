-- Lot 1 / 4 : templates d'échéancier (≠ StrkPaymentPlan élève)

CREATE TABLE IF NOT EXISTS "strk_fee_plan_templates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "institution_id" UUID NOT NULL,
  "fee_schedule_id" UUID,
  "name" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'XOF',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strk_fee_plan_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "strk_fee_plan_templates_institution_id_idx"
  ON "strk_fee_plan_templates"("institution_id");

CREATE INDEX IF NOT EXISTS "strk_fee_plan_templates_fee_schedule_id_idx"
  ON "strk_fee_plan_templates"("fee_schedule_id");

DO $$ BEGIN
  ALTER TABLE "strk_fee_plan_templates"
    ADD CONSTRAINT "strk_fee_plan_templates_institution_id_fkey"
    FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "strk_fee_plan_templates"
    ADD CONSTRAINT "strk_fee_plan_templates_fee_schedule_id_fkey"
    FOREIGN KEY ("fee_schedule_id") REFERENCES "strk_fee_schedules"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "strk_fee_plan_templates"
    ADD CONSTRAINT "strk_fee_plan_templates_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "strk_profiles"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "strk_fee_plan_template_steps" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "template_id" UUID NOT NULL,
  "label" TEXT NOT NULL,
  "percent" INTEGER,
  "amount_cents" INTEGER,
  "due_offset_days" INTEGER,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "strk_fee_plan_template_steps_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "strk_fee_plan_template_steps_template_id_idx"
  ON "strk_fee_plan_template_steps"("template_id");

DO $$ BEGIN
  ALTER TABLE "strk_fee_plan_template_steps"
    ADD CONSTRAINT "strk_fee_plan_template_steps_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "strk_fee_plan_templates"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
