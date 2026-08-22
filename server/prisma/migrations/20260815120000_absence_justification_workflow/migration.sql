-- CreateEnum
CREATE TYPE "strk_justification_status" AS ENUM ('none', 'pending', 'accepted', 'rejected');

-- AlterTable
ALTER TABLE "strk_absences" ADD COLUMN     "justification_reviewed_at" TIMESTAMP(3),
ADD COLUMN     "justification_reviewed_by" UUID,
ADD COLUMN     "justification_status" "strk_justification_status" NOT NULL DEFAULT 'none';

-- AddForeignKey
ALTER TABLE "strk_absences" ADD CONSTRAINT "strk_absences_justification_reviewed_by_fkey" FOREIGN KEY ("justification_reviewed_by") REFERENCES "strk_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill (PRS-005) : dérive le nouveau statut à partir des données
-- existantes. `justified = true` implique nécessairement une décision
-- déjà rendue -> accepted. Une justification déposée mais `justified`
-- resté à false ne peut pas être distinguée entre "jamais examinée" et
-- "rejetée" avec l'ancien modèle -> on la classe prudemment en attente
-- (pending) plutôt que de lui inventer un rejet qui n'a peut-être jamais
-- eu lieu.
UPDATE "strk_absences" SET "justification_status" = 'accepted' WHERE "justified" = true;
UPDATE "strk_absences" SET "justification_status" = 'pending'
  WHERE "justified" IS DISTINCT FROM true
    AND "justification" IS NOT NULL
    AND "justification_status" = 'none';
