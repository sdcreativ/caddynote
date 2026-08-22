-- CreateEnum
CREATE TYPE "strk_availability_status" AS ENUM ('requested', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "strk_teacher_availabilities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "reason" TEXT,
    "status" "strk_availability_status" NOT NULL DEFAULT 'requested',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strk_teacher_availabilities_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "strk_teacher_availabilities" ADD CONSTRAINT "strk_teacher_availabilities_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_teacher_availabilities" ADD CONSTRAINT "strk_teacher_availabilities_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "strk_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_teacher_availabilities" ADD CONSTRAINT "strk_teacher_availabilities_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "strk_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

