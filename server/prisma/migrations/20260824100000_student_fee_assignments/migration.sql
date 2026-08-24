-- Tranche A : affectation élève → grille publiée (+ options facultatives)

CREATE TABLE IF NOT EXISTS "strk_student_fee_assignments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "institution_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "fee_schedule_id" UUID NOT NULL,
  "academic_year" TEXT NOT NULL,
  "cycle_code" TEXT,
  "grade_level_id" UUID,
  "optional_fee_type_codes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_by" UUID NOT NULL,
  "ended_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "strk_student_fee_assignments_institution_id_academic_year_status_idx"
  ON "strk_student_fee_assignments"("institution_id", "academic_year", "status");
CREATE INDEX IF NOT EXISTS "strk_student_fee_assignments_student_id_status_idx"
  ON "strk_student_fee_assignments"("student_id", "status");
CREATE INDEX IF NOT EXISTS "strk_student_fee_assignments_fee_schedule_id_idx"
  ON "strk_student_fee_assignments"("fee_schedule_id");

-- Un seul assignment actif par élève / année scolaire
CREATE UNIQUE INDEX IF NOT EXISTS "strk_student_fee_assignments_active_student_year_uidx"
  ON "strk_student_fee_assignments"("student_id", "academic_year")
  WHERE "status" = 'active';

DO $$ BEGIN
  ALTER TABLE "strk_student_fee_assignments"
    ADD CONSTRAINT "strk_student_fee_assignments_institution_id_fkey"
    FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "strk_student_fee_assignments"
    ADD CONSTRAINT "strk_student_fee_assignments_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "strk_students"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "strk_student_fee_assignments"
    ADD CONSTRAINT "strk_student_fee_assignments_fee_schedule_id_fkey"
    FOREIGN KEY ("fee_schedule_id") REFERENCES "strk_fee_schedules"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "strk_student_fee_assignments"
    ADD CONSTRAINT "strk_student_fee_assignments_grade_level_id_fkey"
    FOREIGN KEY ("grade_level_id") REFERENCES "strk_grade_levels"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "strk_student_fee_assignments"
    ADD CONSTRAINT "strk_student_fee_assignments_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "strk_profiles"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
