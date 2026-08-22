-- CreateEnum
CREATE TYPE "strk_admission_status" AS ENUM ('draft', 'submitted', 'needs_info', 'conditionally_accepted', 'rejected', 'enrolled', 'cancelled');

-- CreateTable
CREATE TABLE "strk_admission_applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "class_id" UUID,
    "academic_year" TEXT NOT NULL,
    "status" "strk_admission_status" NOT NULL DEFAULT 'draft',
    "student_first_name" TEXT NOT NULL,
    "student_last_name" TEXT NOT NULL,
    "student_birth_date" DATE NOT NULL,
    "student_gender" TEXT,
    "guardians" JSONB NOT NULL DEFAULT '[]',
    "documents" JSONB NOT NULL DEFAULT '[]',
    "duplicate_warning" TEXT,
    "application_fee_cents" INTEGER,
    "application_fee_currency" TEXT NOT NULL DEFAULT 'XOF',
    "application_fee_paid" BOOLEAN NOT NULL DEFAULT false,
    "application_fee_confirmed_by" UUID,
    "application_fee_confirmed_at" TIMESTAMP(3),
    "decision_notes" TEXT,
    "decided_by" UUID,
    "decided_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "contact_email" TEXT NOT NULL,
    "public_token" TEXT NOT NULL,
    "previous_application_id" UUID,
    "enrolled_student_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strk_admission_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "strk_admission_applications_public_token_key" ON "strk_admission_applications"("public_token");

-- AddForeignKey
ALTER TABLE "strk_admission_applications" ADD CONSTRAINT "strk_admission_applications_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_admission_applications" ADD CONSTRAINT "strk_admission_applications_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "strk_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_admission_applications" ADD CONSTRAINT "strk_admission_applications_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "strk_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_admission_applications" ADD CONSTRAINT "strk_admission_applications_application_fee_confirmed_by_fkey" FOREIGN KEY ("application_fee_confirmed_by") REFERENCES "strk_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_admission_applications" ADD CONSTRAINT "strk_admission_applications_previous_application_id_fkey" FOREIGN KEY ("previous_application_id") REFERENCES "strk_admission_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_admission_applications" ADD CONSTRAINT "strk_admission_applications_enrolled_student_id_fkey" FOREIGN KEY ("enrolled_student_id") REFERENCES "strk_students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

