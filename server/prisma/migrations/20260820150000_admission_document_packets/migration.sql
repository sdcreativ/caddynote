-- Moteur de pièces d'inscription (catalogue + modèles + items)

CREATE TYPE "strk_admission_application_kind" AS ENUM (
  'pre_registration',
  'first_enrollment',
  're_enrollment',
  'transfer'
);

CREATE TYPE "strk_admission_doc_obligation" AS ENUM (
  'required',
  'optional',
  'conditional'
);

CREATE TYPE "strk_admission_original_mode" AS ENUM (
  'digital_only',
  'copy_then_original',
  'physical_only'
);

CREATE TYPE "strk_admission_doc_item_status" AS ENUM (
  'missing',
  'uploaded',
  'in_review',
  'compliant',
  'non_compliant',
  'unreadable',
  'expired',
  'original_pending',
  'finalized'
);

CREATE TABLE "strk_admission_document_types" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "institution_id" UUID,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT NOT NULL,
  "allowed_mime" TEXT[] DEFAULT ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::TEXT[],
  "max_size_bytes" INTEGER NOT NULL DEFAULT 15728640,
  "max_files" INTEGER NOT NULL DEFAULT 1,
  "validity_days" INTEGER,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strk_admission_document_types_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "strk_admission_packet_templates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "institution_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "application_kind" "strk_admission_application_kind" NOT NULL,
  "level" TEXT,
  "class_id" UUID,
  "academic_year" TEXT,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strk_admission_packet_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "strk_admission_packet_requirements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "template_id" UUID NOT NULL,
  "document_type_id" UUID NOT NULL,
  "obligation" "strk_admission_doc_obligation" NOT NULL DEFAULT 'required',
  "original_mode" "strk_admission_original_mode" NOT NULL DEFAULT 'digital_only',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "help_text" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strk_admission_packet_requirements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "strk_admission_document_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "application_id" UUID NOT NULL,
  "document_type_id" UUID NOT NULL,
  "requirement_id" UUID,
  "status" "strk_admission_doc_item_status" NOT NULL DEFAULT 'missing',
  "file_key" TEXT,
  "file_name" TEXT,
  "content_type" TEXT,
  "size_bytes" INTEGER,
  "rejection_reason" TEXT,
  "review_notes" TEXT,
  "reviewed_by" UUID,
  "reviewed_at" TIMESTAMP(3),
  "original_seen_at" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "previous_item_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strk_admission_document_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "strk_admission_applications"
  ADD COLUMN "application_kind" "strk_admission_application_kind" NOT NULL DEFAULT 'pre_registration',
  ADD COLUMN "level" TEXT,
  ADD COLUMN "packet_template_id" UUID;

CREATE UNIQUE INDEX "strk_admission_document_types_institution_id_code_key"
  ON "strk_admission_document_types"("institution_id", "code");

CREATE INDEX "strk_admission_document_types_institution_id_category_idx"
  ON "strk_admission_document_types"("institution_id", "category");

CREATE UNIQUE INDEX "strk_admission_packet_templates_institution_id_code_key"
  ON "strk_admission_packet_templates"("institution_id", "code");

CREATE INDEX "strk_admission_packet_templates_institution_id_application_kind_is_active_idx"
  ON "strk_admission_packet_templates"("institution_id", "application_kind", "is_active");

CREATE UNIQUE INDEX "strk_admission_packet_requirements_template_id_document_type_id_key"
  ON "strk_admission_packet_requirements"("template_id", "document_type_id");

CREATE INDEX "strk_admission_document_items_application_id_status_idx"
  ON "strk_admission_document_items"("application_id", "status");

CREATE INDEX "strk_admission_document_items_document_type_id_idx"
  ON "strk_admission_document_items"("document_type_id");

ALTER TABLE "strk_admission_document_types"
  ADD CONSTRAINT "strk_admission_document_types_institution_id_fkey"
  FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "strk_admission_packet_templates"
  ADD CONSTRAINT "strk_admission_packet_templates_institution_id_fkey"
  FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "strk_admission_packet_templates"
  ADD CONSTRAINT "strk_admission_packet_templates_class_id_fkey"
  FOREIGN KEY ("class_id") REFERENCES "strk_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "strk_admission_packet_requirements"
  ADD CONSTRAINT "strk_admission_packet_requirements_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "strk_admission_packet_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "strk_admission_packet_requirements"
  ADD CONSTRAINT "strk_admission_packet_requirements_document_type_id_fkey"
  FOREIGN KEY ("document_type_id") REFERENCES "strk_admission_document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "strk_admission_document_items"
  ADD CONSTRAINT "strk_admission_document_items_application_id_fkey"
  FOREIGN KEY ("application_id") REFERENCES "strk_admission_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "strk_admission_document_items"
  ADD CONSTRAINT "strk_admission_document_items_document_type_id_fkey"
  FOREIGN KEY ("document_type_id") REFERENCES "strk_admission_document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "strk_admission_document_items"
  ADD CONSTRAINT "strk_admission_document_items_requirement_id_fkey"
  FOREIGN KEY ("requirement_id") REFERENCES "strk_admission_packet_requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "strk_admission_document_items"
  ADD CONSTRAINT "strk_admission_document_items_reviewed_by_fkey"
  FOREIGN KEY ("reviewed_by") REFERENCES "strk_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "strk_admission_document_items"
  ADD CONSTRAINT "strk_admission_document_items_previous_item_id_fkey"
  FOREIGN KEY ("previous_item_id") REFERENCES "strk_admission_document_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "strk_admission_applications"
  ADD CONSTRAINT "strk_admission_applications_packet_template_id_fkey"
  FOREIGN KEY ("packet_template_id") REFERENCES "strk_admission_packet_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
