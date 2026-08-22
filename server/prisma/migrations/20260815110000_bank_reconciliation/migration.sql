-- CreateEnum
CREATE TYPE "strk_bank_line_status" AS ENUM ('unmatched', 'matched', 'ignored');

-- CreateTable
CREATE TABLE "strk_bank_statement_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "label" TEXT NOT NULL,
    "external_ref" TEXT,
    "status" "strk_bank_line_status" NOT NULL DEFAULT 'unmatched',
    "matched_payment_id" UUID,
    "matched_by" UUID,
    "matched_at" TIMESTAMP(3),
    "imported_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strk_bank_statement_lines_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "strk_bank_statement_lines" ADD CONSTRAINT "strk_bank_statement_lines_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_bank_statement_lines" ADD CONSTRAINT "strk_bank_statement_lines_matched_payment_id_fkey" FOREIGN KEY ("matched_payment_id") REFERENCES "strk_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_bank_statement_lines" ADD CONSTRAINT "strk_bank_statement_lines_matched_by_fkey" FOREIGN KEY ("matched_by") REFERENCES "strk_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_bank_statement_lines" ADD CONSTRAINT "strk_bank_statement_lines_imported_by_fkey" FOREIGN KEY ("imported_by") REFERENCES "strk_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

