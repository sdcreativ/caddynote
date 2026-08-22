-- CreateEnum
CREATE TYPE "strk_observation_category" AS ENUM ('positive', 'negative', 'neutral');

-- CreateEnum
CREATE TYPE "strk_incident_severity" AS ENUM ('minor', 'moderate', 'major');

-- CreateEnum
CREATE TYPE "strk_incident_status" AS ENUM ('reported', 'under_review', 'council_referred', 'resolved');

-- AlterTable
ALTER TABLE "strk_student_guardians" ADD COLUMN     "can_view_discipline" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "strk_pedagogical_observations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "course_id" UUID,
    "category" "strk_observation_category" NOT NULL DEFAULT 'neutral',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restricted_to_user_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visible_to_family" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strk_pedagogical_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_disciplinary_incidents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "reported_by" UUID NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "severity" "strk_incident_severity" NOT NULL DEFAULT 'minor',
    "status" "strk_incident_status" NOT NULL DEFAULT 'reported',
    "involved_student_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "council_date" TIMESTAMP(3),
    "decision" TEXT,
    "sanction_type" TEXT,
    "decided_by" UUID,
    "decided_at" TIMESTAMP(3),
    "restricted_to_user_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visible_to_family" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strk_disciplinary_incidents_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "strk_pedagogical_observations" ADD CONSTRAINT "strk_pedagogical_observations_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_pedagogical_observations" ADD CONSTRAINT "strk_pedagogical_observations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "strk_students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_pedagogical_observations" ADD CONSTRAINT "strk_pedagogical_observations_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "strk_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_pedagogical_observations" ADD CONSTRAINT "strk_pedagogical_observations_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "strk_courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_disciplinary_incidents" ADD CONSTRAINT "strk_disciplinary_incidents_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_disciplinary_incidents" ADD CONSTRAINT "strk_disciplinary_incidents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "strk_students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_disciplinary_incidents" ADD CONSTRAINT "strk_disciplinary_incidents_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "strk_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_disciplinary_incidents" ADD CONSTRAINT "strk_disciplinary_incidents_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "strk_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

