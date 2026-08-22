-- CreateEnum
CREATE TYPE "strk_schedule_exception_type" AS ENUM ('cancelled', 'substituted');

-- CreateTable
CREATE TABLE "strk_schedule_exceptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "schedule_id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type" "strk_schedule_exception_type" NOT NULL,
    "substitute_teacher_id" UUID,
    "reason" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strk_schedule_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "strk_schedule_exceptions_schedule_id_date_key" ON "strk_schedule_exceptions"("schedule_id", "date");

-- AddForeignKey
ALTER TABLE "strk_schedule_exceptions" ADD CONSTRAINT "strk_schedule_exceptions_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "strk_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_schedule_exceptions" ADD CONSTRAINT "strk_schedule_exceptions_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_schedule_exceptions" ADD CONSTRAINT "strk_schedule_exceptions_substitute_teacher_id_fkey" FOREIGN KEY ("substitute_teacher_id") REFERENCES "strk_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_schedule_exceptions" ADD CONSTRAINT "strk_schedule_exceptions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "strk_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

