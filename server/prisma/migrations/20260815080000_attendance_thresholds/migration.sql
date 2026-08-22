-- CreateEnum
CREATE TYPE "strk_threshold_alert_type" AS ENUM ('absence', 'lateness');

-- AlterTable
ALTER TABLE "strk_institutions" ADD COLUMN     "absence_threshold" INTEGER,
ADD COLUMN     "lateness_threshold" INTEGER,
ADD COLUMN     "threshold_window_days" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "strk_threshold_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "type" "strk_threshold_alert_type" NOT NULL,
    "count" INTEGER NOT NULL,
    "threshold" INTEGER NOT NULL,
    "window_days" INTEGER NOT NULL,
    "triggered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strk_threshold_alerts_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "strk_threshold_alerts" ADD CONSTRAINT "strk_threshold_alerts_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_threshold_alerts" ADD CONSTRAINT "strk_threshold_alerts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "strk_students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

