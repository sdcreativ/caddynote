-- Compléments spec pièces d'inscription (fenêtres, motifs, relances, confirmation, campus, rétention)

ALTER TYPE "strk_document_type" ADD VALUE IF NOT EXISTS 'admission_confirmation';

ALTER TABLE "strk_admission_applications"
  ADD COLUMN IF NOT EXISTS "campus" TEXT,
  ADD COLUMN IF NOT EXISTS "confirmation_document_id" UUID,
  ADD COLUMN IF NOT EXISTS "instruction_status" TEXT;

ALTER TABLE "strk_admission_packet_templates"
  ADD COLUMN IF NOT EXISTS "campus" TEXT;

ALTER TABLE "strk_admission_document_types"
  ADD COLUMN IF NOT EXISTS "retention_days" INTEGER;

ALTER TABLE "strk_admission_document_items"
  ADD COLUMN IF NOT EXISTS "deadline_reminded_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "expiry_reminded_at" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "strk_admission_rejection_reasons" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "institution_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strk_admission_rejection_reasons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "strk_admission_rejection_reasons_institution_id_code_key"
  ON "strk_admission_rejection_reasons"("institution_id", "code");

CREATE INDEX IF NOT EXISTS "strk_admission_rejection_reasons_institution_id_idx"
  ON "strk_admission_rejection_reasons"("institution_id");

DO $$ BEGIN
  ALTER TABLE "strk_admission_rejection_reasons"
    ADD CONSTRAINT "strk_admission_rejection_reasons_institution_id_fkey"
    FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
