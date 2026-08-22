-- CreateEnum
CREATE TYPE "strk_assignment_reminder_type" AS ENUM ('published', 'due_soon', 'overdue');

-- CreateTable
CREATE TABLE "strk_assignment_reminders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assignment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "type" "strk_assignment_reminder_type" NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strk_assignment_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "strk_assignment_reminders_assignment_id_student_id_type_key" ON "strk_assignment_reminders"("assignment_id", "student_id", "type");

-- AddForeignKey
ALTER TABLE "strk_assignment_reminders" ADD CONSTRAINT "strk_assignment_reminders_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "strk_students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

