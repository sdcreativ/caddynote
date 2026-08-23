-- Lot 1 / 3 : grilles tarifaires établissement + lignes

CREATE TABLE IF NOT EXISTS "strk_fee_schedules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "institution_id" UUID NOT NULL,
  "campus_id" UUID,
  "academic_year" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'XOF',
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "effective_from" TIMESTAMP(3),
  "validated_at" TIMESTAMP(3),
  "validated_by" UUID,
  "published_at" TIMESTAMP(3),
  "published_by" UUID,
  "previous_version_id" UUID,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strk_fee_schedules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "strk_fee_schedules_institution_id_academic_year_status_idx"
  ON "strk_fee_schedules"("institution_id", "academic_year", "status");

CREATE INDEX IF NOT EXISTS "strk_fee_schedules_campus_id_idx"
  ON "strk_fee_schedules"("campus_id");

DO $$ BEGIN
  ALTER TABLE "strk_fee_schedules"
    ADD CONSTRAINT "strk_fee_schedules_institution_id_fkey"
    FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "strk_fee_schedules"
    ADD CONSTRAINT "strk_fee_schedules_campus_id_fkey"
    FOREIGN KEY ("campus_id") REFERENCES "strk_campuses"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "strk_fee_schedules"
    ADD CONSTRAINT "strk_fee_schedules_previous_version_id_fkey"
    FOREIGN KEY ("previous_version_id") REFERENCES "strk_fee_schedules"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "strk_fee_schedules"
    ADD CONSTRAINT "strk_fee_schedules_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "strk_profiles"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "strk_fee_schedules"
    ADD CONSTRAINT "strk_fee_schedules_validated_by_fkey"
    FOREIGN KEY ("validated_by") REFERENCES "strk_profiles"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "strk_fee_schedules"
    ADD CONSTRAINT "strk_fee_schedules_published_by_fkey"
    FOREIGN KEY ("published_by") REFERENCES "strk_profiles"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "strk_fee_schedule_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "fee_schedule_id" UUID NOT NULL,
  "fee_type_id" UUID,
  "fee_type_code" TEXT NOT NULL,
  "cycle_code" TEXT,
  "grade_level_id" UUID,
  "enrollment_type" TEXT,
  "student_status" TEXT,
  "fee_origin" TEXT NOT NULL DEFAULT 'institution',
  "amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'XOF',
  "is_mandatory" BOOLEAN NOT NULL DEFAULT true,
  "is_refundable" BOOLEAN NOT NULL DEFAULT false,
  "is_discountable" BOOLEAN NOT NULL DEFAULT true,
  "frequency" TEXT NOT NULL DEFAULT 'annual',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "strk_fee_schedule_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "strk_fee_schedule_items_fee_schedule_id_idx"
  ON "strk_fee_schedule_items"("fee_schedule_id");

CREATE INDEX IF NOT EXISTS "strk_fee_schedule_items_fee_type_code_idx"
  ON "strk_fee_schedule_items"("fee_type_code");

DO $$ BEGIN
  ALTER TABLE "strk_fee_schedule_items"
    ADD CONSTRAINT "strk_fee_schedule_items_fee_schedule_id_fkey"
    FOREIGN KEY ("fee_schedule_id") REFERENCES "strk_fee_schedules"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "strk_fee_schedule_items"
    ADD CONSTRAINT "strk_fee_schedule_items_fee_type_id_fkey"
    FOREIGN KEY ("fee_type_id") REFERENCES "strk_fee_types"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "strk_fee_schedule_items"
    ADD CONSTRAINT "strk_fee_schedule_items_grade_level_id_fkey"
    FOREIGN KEY ("grade_level_id") REFERENCES "strk_grade_levels"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
