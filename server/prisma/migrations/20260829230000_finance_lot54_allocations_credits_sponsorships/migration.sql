-- Lot 5.4 : allocations multi-factures, avoirs, parrainages

ALTER TABLE "strk_invoices" ADD COLUMN IF NOT EXISTS "credit_applied_cents" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "strk_payment_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "strk_payment_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "strk_payment_allocations_payment_id_invoice_id_key"
  ON "strk_payment_allocations"("payment_id", "invoice_id");
CREATE INDEX IF NOT EXISTS "strk_payment_allocations_invoice_id_idx"
  ON "strk_payment_allocations"("invoice_id");

ALTER TABLE "strk_payment_allocations"
  ADD CONSTRAINT "strk_payment_allocations_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "strk_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strk_payment_allocations"
  ADD CONSTRAINT "strk_payment_allocations_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "strk_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill : 1 allocation par paiement existant
INSERT INTO "strk_payment_allocations" ("payment_id", "invoice_id", "amount_cents")
SELECT p."id", p."invoice_id", p."amount_cents"
FROM "strk_payments" p
WHERE NOT EXISTS (
  SELECT 1 FROM "strk_payment_allocations" a WHERE a."payment_id" = p."id"
);

CREATE TABLE IF NOT EXISTS "strk_credit_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "remaining_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "related_invoice_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "strk_credit_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "strk_credit_notes_institution_id_student_id_idx"
  ON "strk_credit_notes"("institution_id", "student_id");

ALTER TABLE "strk_credit_notes"
  ADD CONSTRAINT "strk_credit_notes_institution_id_fkey"
  FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "strk_credit_notes"
  ADD CONSTRAINT "strk_credit_notes_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "strk_students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "strk_credit_notes"
  ADD CONSTRAINT "strk_credit_notes_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "strk_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "strk_credit_note_applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "credit_note_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "strk_credit_note_applications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "strk_credit_note_applications_invoice_id_idx"
  ON "strk_credit_note_applications"("invoice_id");

ALTER TABLE "strk_credit_note_applications"
  ADD CONSTRAINT "strk_credit_note_applications_credit_note_id_fkey"
  FOREIGN KEY ("credit_note_id") REFERENCES "strk_credit_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strk_credit_note_applications"
  ADD CONSTRAINT "strk_credit_note_applications_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "strk_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strk_credit_note_applications"
  ADD CONSTRAINT "strk_credit_note_applications_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "strk_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "strk_sponsorships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "sponsor_name" TEXT NOT NULL,
    "sponsor_type" TEXT NOT NULL DEFAULT 'individual',
    "amount_cents" INTEGER NOT NULL,
    "remaining_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "fee_type_code" TEXT,
    "academic_year" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "strk_sponsorships_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "strk_sponsorships_institution_id_student_id_idx"
  ON "strk_sponsorships"("institution_id", "student_id");

ALTER TABLE "strk_sponsorships"
  ADD CONSTRAINT "strk_sponsorships_institution_id_fkey"
  FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "strk_sponsorships"
  ADD CONSTRAINT "strk_sponsorships_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "strk_students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "strk_sponsorships"
  ADD CONSTRAINT "strk_sponsorships_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "strk_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "strk_sponsorship_applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sponsorship_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "strk_sponsorship_applications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "strk_sponsorship_applications_invoice_id_idx"
  ON "strk_sponsorship_applications"("invoice_id");

ALTER TABLE "strk_sponsorship_applications"
  ADD CONSTRAINT "strk_sponsorship_applications_sponsorship_id_fkey"
  FOREIGN KEY ("sponsorship_id") REFERENCES "strk_sponsorships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strk_sponsorship_applications"
  ADD CONSTRAINT "strk_sponsorship_applications_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "strk_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strk_sponsorship_applications"
  ADD CONSTRAINT "strk_sponsorship_applications_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "strk_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
