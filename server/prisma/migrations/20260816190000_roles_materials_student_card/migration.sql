-- AlterEnum
ALTER TYPE "strk_user_role" ADD VALUE 'secretary';
ALTER TYPE "strk_user_role" ADD VALUE 'accountant';
ALTER TYPE "strk_user_role" ADD VALUE 'supervisor';
ALTER TYPE "strk_user_role" ADD VALUE 'head_teacher';

-- AlterEnum
ALTER TYPE "strk_document_type" ADD VALUE 'student_card';

-- AlterTable
ALTER TABLE "strk_course_materials" ADD COLUMN "file_key" TEXT;
