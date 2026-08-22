-- PED-001, EVA-003 (import via API), FIN échéanciers, admissions paiement en ligne,
-- DOC facture/attestation/carte, ELV-003 historique pluriannuel.

-- ELV-003 : historique d'inscription pluriannuel
ALTER TABLE "strk_class_students" DROP CONSTRAINT IF EXISTS "strk_class_students_class_id_student_id_key";
ALTER TABLE "strk_class_students" ADD COLUMN IF NOT EXISTS "academic_year" TEXT;
UPDATE "strk_class_students"
  SET "academic_year" = COALESCE(
    (SELECT c."academic_year" FROM "strk_classes" c WHERE c."id" = "strk_class_students"."class_id"),
    to_char(CURRENT_DATE, 'YYYY') || '-' || to_char(CURRENT_DATE + INTERVAL '1 year', 'YYYY')
  )
  WHERE "academic_year" IS NULL;
ALTER TABLE "strk_class_students" ALTER COLUMN "academic_year" SET NOT NULL;
ALTER TABLE "strk_class_students" ADD COLUMN IF NOT EXISTS "ended_at" DATE;
ALTER TABLE "strk_class_students" ADD COLUMN IF NOT EXISTS "outcome" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "strk_class_students_student_id_academic_year_key"
  ON "strk_class_students"("student_id", "academic_year");
CREATE INDEX IF NOT EXISTS "strk_class_students_class_id_student_id_idx"
  ON "strk_class_students"("class_id", "student_id");

-- PED-001 : cahier de textes
CREATE TABLE IF NOT EXISTS "strk_lesson_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "course_id" UUID NOT NULL,
  "lesson_date" DATE NOT NULL,
  "title" TEXT,
  "content_covered" TEXT NOT NULL,
  "homework_given" TEXT,
  "assignment_ids" JSONB NOT NULL DEFAULT '[]',
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strk_lesson_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "strk_lesson_entries_course_id_lesson_date_idx"
  ON "strk_lesson_entries"("course_id", "lesson_date");
ALTER TABLE "strk_lesson_entries"
  ADD CONSTRAINT "strk_lesson_entries_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "strk_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strk_lesson_entries"
  ADD CONSTRAINT "strk_lesson_entries_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "strk_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FIN : échéanciers
CREATE TABLE IF NOT EXISTS "strk_payment_plans" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "institution_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "label" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'XOF',
  "total_cents" INTEGER NOT NULL,
  "academic_year" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strk_payment_plans_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "strk_payment_plans"
  ADD CONSTRAINT "strk_payment_plans_institution_id_fkey"
  FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "strk_payment_plans"
  ADD CONSTRAINT "strk_payment_plans_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "strk_students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "strk_payment_plans"
  ADD CONSTRAINT "strk_payment_plans_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "strk_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "strk_invoices" ADD COLUMN IF NOT EXISTS "payment_plan_id" UUID;
ALTER TABLE "strk_invoices" ADD COLUMN IF NOT EXISTS "installment_index" INTEGER;
ALTER TABLE "strk_invoices"
  ADD CONSTRAINT "strk_invoices_payment_plan_id_fkey"
  FOREIGN KEY ("payment_plan_id") REFERENCES "strk_payment_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Admissions : paiement en ligne
ALTER TABLE "strk_admission_applications" ADD COLUMN IF NOT EXISTS "application_fee_provider" TEXT;
ALTER TABLE "strk_admission_applications" ADD COLUMN IF NOT EXISTS "application_fee_provider_ref" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "strk_admission_applications_application_fee_provider_ref_key"
  ON "strk_admission_applications"("application_fee_provider_ref");

-- Documents : nouveaux types (PG : ADD VALUE hors échec si déjà présent)
DO $$ BEGIN
  ALTER TYPE "strk_document_type" ADD VALUE 'school_attestation';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE "strk_document_type" ADD VALUE 'invoice';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;