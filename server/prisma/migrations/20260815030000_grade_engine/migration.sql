-- CreateEnum
CREATE TYPE "strk_grade_status" AS ENUM ('draft', 'published', 'corrected');

-- AlterEnum
ALTER TYPE "strk_document_type" ADD VALUE 'report_card';

-- AlterTable
ALTER TABLE "strk_courses" ADD COLUMN     "coefficient" DECIMAL(65,30) NOT NULL DEFAULT 1,
ADD COLUMN     "subject_id" UUID;

-- AlterTable
ALTER TABLE "strk_grades" ADD COLUMN     "coefficient" DECIMAL(65,30) NOT NULL DEFAULT 1,
ADD COLUMN     "corrected_at" TIMESTAMP(3),
ADD COLUMN     "corrected_by" UUID,
ADD COLUMN     "period_id" UUID,
ADD COLUMN     "previous_value" DECIMAL(65,30),
ADD COLUMN     "published_at" TIMESTAMP(3),
ADD COLUMN     "published_by" UUID,
ADD COLUMN     "status" "strk_grade_status" NOT NULL DEFAULT 'draft';

-- CreateTable
CREATE TABLE "strk_academic_periods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "academic_year" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strk_academic_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_grade_computations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "subject_id" UUID,
    "average" DECIMAL(65,30) NOT NULL,
    "rank" INTEGER,
    "student_count" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "computed_by" UUID,

    CONSTRAINT "strk_grade_computations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "strk_academic_periods_institution_id_academic_year_name_key" ON "strk_academic_periods"("institution_id", "academic_year", "name");

-- CreateIndex
CREATE INDEX "strk_grade_computations_period_id_class_id_student_id_subje_idx" ON "strk_grade_computations"("period_id", "class_id", "student_id", "subject_id");

-- AddForeignKey
ALTER TABLE "strk_courses" ADD CONSTRAINT "strk_courses_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "strk_subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_grades" ADD CONSTRAINT "strk_grades_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "strk_academic_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_academic_periods" ADD CONSTRAINT "strk_academic_periods_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_grade_computations" ADD CONSTRAINT "strk_grade_computations_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_grade_computations" ADD CONSTRAINT "strk_grade_computations_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "strk_academic_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_grade_computations" ADD CONSTRAINT "strk_grade_computations_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "strk_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_grade_computations" ADD CONSTRAINT "strk_grade_computations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "strk_students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_grade_computations" ADD CONSTRAINT "strk_grade_computations_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "strk_subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

