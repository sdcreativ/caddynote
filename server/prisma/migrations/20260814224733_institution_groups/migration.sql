-- AlterEnum
ALTER TYPE "strk_user_role" ADD VALUE 'group_owner';

-- AlterTable
ALTER TABLE "strk_institutions" ADD COLUMN     "group_id" UUID;

-- AlterTable
ALTER TABLE "strk_profiles" ADD COLUMN     "group_id" UUID;

-- CreateTable
CREATE TABLE "strk_institution_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "strk_institution_groups_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "strk_institutions" ADD CONSTRAINT "strk_institutions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "strk_institution_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_profiles" ADD CONSTRAINT "strk_profiles_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "strk_institution_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
