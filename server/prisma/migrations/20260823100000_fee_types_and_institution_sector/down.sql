-- Rollback manuel Lot 1 / 1 (réversible) — exécuter uniquement en local si besoin.
-- Ne pas exécuter sur staging/prod sans autorisation.

ALTER TABLE "strk_fee_items" DROP CONSTRAINT IF EXISTS "strk_fee_items_fee_type_id_fkey";
ALTER TABLE "strk_fee_items" DROP CONSTRAINT IF EXISTS "strk_fee_items_campus_id_fkey";
DROP INDEX IF EXISTS "strk_fee_items_campus_id_idx";
DROP INDEX IF EXISTS "strk_fee_items_institution_id_fee_type_code_idx";
ALTER TABLE "strk_fee_items"
  DROP COLUMN IF EXISTS "frequency",
  DROP COLUMN IF EXISTS "is_discountable",
  DROP COLUMN IF EXISTS "is_refundable",
  DROP COLUMN IF EXISTS "is_mandatory",
  DROP COLUMN IF EXISTS "fee_origin",
  DROP COLUMN IF EXISTS "fee_type_code",
  DROP COLUMN IF EXISTS "fee_type_id",
  DROP COLUMN IF EXISTS "campus_id";

ALTER TABLE "strk_classes" DROP CONSTRAINT IF EXISTS "strk_classes_grade_level_id_fkey";
DROP INDEX IF EXISTS "strk_classes_grade_level_id_idx";
ALTER TABLE "strk_classes" DROP COLUMN IF EXISTS "grade_level_id";

DROP TABLE IF EXISTS "strk_fee_types";
DROP TABLE IF EXISTS "strk_grade_levels";
DROP TABLE IF EXISTS "strk_education_cycles";

ALTER TABLE "strk_institutions" DROP COLUMN IF EXISTS "funding_sector";
