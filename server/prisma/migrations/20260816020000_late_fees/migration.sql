-- AlterTable
ALTER TABLE "strk_institutions" ADD COLUMN     "late_fee_cents" INTEGER,
ADD COLUMN     "late_fee_grace_days" INTEGER NOT NULL DEFAULT 7;
