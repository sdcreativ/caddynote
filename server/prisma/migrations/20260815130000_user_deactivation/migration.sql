-- AlterTable
ALTER TABLE "strk_profiles" ADD COLUMN     "deactivated_at" TIMESTAMP(3),
ADD COLUMN     "deactivated_by" UUID,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;
