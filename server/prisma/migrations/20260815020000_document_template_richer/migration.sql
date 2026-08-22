-- CreateEnum
CREATE TYPE "strk_document_font" AS ENUM ('helvetica', 'times', 'courier');

-- AlterTable
ALTER TABLE "strk_document_templates"
  ADD COLUMN "font" "strk_document_font" NOT NULL DEFAULT 'helvetica',
  ADD COLUMN "watermark_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "signature_label" TEXT,
  ADD COLUMN "signature_name" TEXT;
