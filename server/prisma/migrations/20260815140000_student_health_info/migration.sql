-- AlterTable
ALTER TABLE "strk_student_guardians" ADD COLUMN     "can_view_health" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "strk_student_health_info" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "blood_type" TEXT,
    "allergies" TEXT,
    "medical_conditions" TEXT,
    "medications" TEXT,
    "emergency_contact_name" TEXT,
    "emergency_contact_phone" TEXT,
    "additional_notes" TEXT,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strk_student_health_info_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "strk_student_health_info_student_id_key" ON "strk_student_health_info"("student_id");

-- AddForeignKey
ALTER TABLE "strk_student_health_info" ADD CONSTRAINT "strk_student_health_info_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "strk_students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_student_health_info" ADD CONSTRAINT "strk_student_health_info_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
