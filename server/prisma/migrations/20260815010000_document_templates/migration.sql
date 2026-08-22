-- CreateTable
CREATE TABLE "strk_document_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "type" "strk_document_type" NOT NULL,
    "logo_key" TEXT,
    "accent_color" TEXT,
    "footer_text" TEXT,
    "show_address" BOOLEAN NOT NULL DEFAULT true,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strk_document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "strk_document_templates_institution_id_type_key" ON "strk_document_templates"("institution_id", "type");

-- AddForeignKey
ALTER TABLE "strk_document_templates" ADD CONSTRAINT "strk_document_templates_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_document_templates" ADD CONSTRAINT "strk_document_templates_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "strk_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
