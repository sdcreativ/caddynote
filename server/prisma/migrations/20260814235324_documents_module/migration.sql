-- CreateEnum
CREATE TYPE "strk_document_type" AS ENUM ('enrollment_certificate', 'payment_receipt');

-- CreateEnum
CREATE TYPE "strk_document_status" AS ENUM ('generated', 'revoked');

-- CreateTable
CREATE TABLE "strk_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "type" "strk_document_type" NOT NULL,
    "subject_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "strk_document_status" NOT NULL DEFAULT 'generated',
    "title" TEXT NOT NULL,
    "data_snapshot" JSONB NOT NULL,
    "file_key" TEXT,
    "verification_token" TEXT NOT NULL,
    "generated_by" UUID NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "strk_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "strk_documents_verification_token_key" ON "strk_documents"("verification_token");

-- CreateIndex
CREATE UNIQUE INDEX "strk_documents_institution_id_type_subject_id_version_key" ON "strk_documents"("institution_id", "type", "subject_id", "version");

-- AddForeignKey
ALTER TABLE "strk_documents" ADD CONSTRAINT "strk_documents_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_documents" ADD CONSTRAINT "strk_documents_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "strk_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
