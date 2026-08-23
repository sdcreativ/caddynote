-- Lot 1 / 1 : types de frais, secteur établissement, niveaux de classe, extensions FeeItem.
-- Additif uniquement — aucune suppression de tables finance existantes.

ALTER TABLE "strk_institutions"
  ADD COLUMN IF NOT EXISTS "funding_sector" TEXT;

CREATE TABLE IF NOT EXISTS "strk_education_cycles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strk_education_cycles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "strk_education_cycles_code_key"
  ON "strk_education_cycles"("code");

CREATE TABLE IF NOT EXISTS "strk_grade_levels" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "cycle_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "abbreviation" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strk_grade_levels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "strk_grade_levels_code_key"
  ON "strk_grade_levels"("code");

CREATE INDEX IF NOT EXISTS "strk_grade_levels_cycle_id_idx"
  ON "strk_grade_levels"("cycle_id");

DO $$ BEGIN
  ALTER TABLE "strk_grade_levels"
    ADD CONSTRAINT "strk_grade_levels_cycle_id_fkey"
    FOREIGN KEY ("cycle_id") REFERENCES "strk_education_cycles"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "strk_classes"
  ADD COLUMN IF NOT EXISTS "grade_level_id" UUID;

CREATE INDEX IF NOT EXISTS "strk_classes_grade_level_id_idx"
  ON "strk_classes"("grade_level_id");

DO $$ BEGIN
  ALTER TABLE "strk_classes"
    ADD CONSTRAINT "strk_classes_grade_level_id_fkey"
    FOREIGN KEY ("grade_level_id") REFERENCES "strk_grade_levels"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "strk_fee_types" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "institution_id" UUID,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "frequency" TEXT NOT NULL DEFAULT 'configurable',
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strk_fee_types_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "strk_fee_types_institution_id_category_idx"
  ON "strk_fee_types"("institution_id", "category");

-- Unicité plateforme (institution_id IS NULL) et tenant séparées.
CREATE UNIQUE INDEX IF NOT EXISTS "strk_fee_types_platform_code_key"
  ON "strk_fee_types"("code") WHERE "institution_id" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "strk_fee_types_tenant_code_key"
  ON "strk_fee_types"("institution_id", "code") WHERE "institution_id" IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE "strk_fee_types"
    ADD CONSTRAINT "strk_fee_types_institution_id_fkey"
    FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "strk_fee_items"
  ADD COLUMN IF NOT EXISTS "campus_id" UUID,
  ADD COLUMN IF NOT EXISTS "fee_type_id" UUID,
  ADD COLUMN IF NOT EXISTS "fee_type_code" TEXT,
  ADD COLUMN IF NOT EXISTS "fee_origin" TEXT,
  ADD COLUMN IF NOT EXISTS "is_mandatory" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "is_refundable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "is_discountable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "frequency" TEXT;

CREATE INDEX IF NOT EXISTS "strk_fee_items_institution_id_fee_type_code_idx"
  ON "strk_fee_items"("institution_id", "fee_type_code");

CREATE INDEX IF NOT EXISTS "strk_fee_items_campus_id_idx"
  ON "strk_fee_items"("campus_id");

DO $$ BEGIN
  ALTER TABLE "strk_fee_items"
    ADD CONSTRAINT "strk_fee_items_campus_id_fkey"
    FOREIGN KEY ("campus_id") REFERENCES "strk_campuses"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "strk_fee_items"
    ADD CONSTRAINT "strk_fee_items_fee_type_id_fkey"
    FOREIGN KEY ("fee_type_id") REFERENCES "strk_fee_types"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Seed cycles (ids stables pour tests / mapping)
INSERT INTO "strk_education_cycles" ("id", "code", "label", "sort_order", "updated_at")
VALUES
  ('c1000000-0000-4000-8000-000000000001', 'PRESCHOOL', 'Préscolaire', 10, CURRENT_TIMESTAMP),
  ('c1000000-0000-4000-8000-000000000002', 'PRIMARY', 'Primaire', 20, CURRENT_TIMESTAMP),
  ('c1000000-0000-4000-8000-000000000003', 'COLLEGE', 'Collège', 30, CURRENT_TIMESTAMP),
  ('c1000000-0000-4000-8000-000000000004', 'LYCEE', 'Lycée', 40, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "strk_grade_levels" ("id", "cycle_id", "code", "label", "abbreviation", "sort_order", "updated_at")
VALUES
  ('a1100000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'PRESCHOOL_PS', 'Petite section', 'PS', 11, CURRENT_TIMESTAMP),
  ('a1100000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 'PRESCHOOL_MS', 'Moyenne section', 'MS', 12, CURRENT_TIMESTAMP),
  ('a1100000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000001', 'PRESCHOOL_GS', 'Grande section', 'GS', 13, CURRENT_TIMESTAMP),
  ('a1100000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000002', 'PRIMARY_CP1', 'Cours préparatoire 1', 'CP1', 21, CURRENT_TIMESTAMP),
  ('a1100000-0000-4000-8000-000000000005', 'c1000000-0000-4000-8000-000000000002', 'PRIMARY_CP2', 'Cours préparatoire 2', 'CP2', 22, CURRENT_TIMESTAMP),
  ('a1100000-0000-4000-8000-000000000006', 'c1000000-0000-4000-8000-000000000002', 'PRIMARY_CE1', 'Cours élémentaire 1', 'CE1', 23, CURRENT_TIMESTAMP),
  ('a1100000-0000-4000-8000-000000000007', 'c1000000-0000-4000-8000-000000000002', 'PRIMARY_CE2', 'Cours élémentaire 2', 'CE2', 24, CURRENT_TIMESTAMP),
  ('a1100000-0000-4000-8000-000000000008', 'c1000000-0000-4000-8000-000000000002', 'PRIMARY_CM1', 'Cours moyen 1', 'CM1', 25, CURRENT_TIMESTAMP),
  ('a1100000-0000-4000-8000-000000000009', 'c1000000-0000-4000-8000-000000000002', 'PRIMARY_CM2', 'Cours moyen 2', 'CM2', 26, CURRENT_TIMESTAMP),
  ('a1100000-0000-4000-8000-00000000000a', 'c1000000-0000-4000-8000-000000000003', 'COLLEGE_6', 'Sixième', '6e', 31, CURRENT_TIMESTAMP),
  ('a1100000-0000-4000-8000-00000000000b', 'c1000000-0000-4000-8000-000000000003', 'COLLEGE_5', 'Cinquième', '5e', 32, CURRENT_TIMESTAMP),
  ('a1100000-0000-4000-8000-00000000000c', 'c1000000-0000-4000-8000-000000000003', 'COLLEGE_4', 'Quatrième', '4e', 33, CURRENT_TIMESTAMP),
  ('a1100000-0000-4000-8000-00000000000d', 'c1000000-0000-4000-8000-000000000003', 'COLLEGE_3', 'Troisième', '3e', 34, CURRENT_TIMESTAMP),
  ('a1100000-0000-4000-8000-00000000000e', 'c1000000-0000-4000-8000-000000000004', 'LYCEE_2NDE', 'Seconde', '2nde', 41, CURRENT_TIMESTAMP),
  ('a1100000-0000-4000-8000-00000000000f', 'c1000000-0000-4000-8000-000000000004', 'LYCEE_1ERE', 'Première', '1re', 42, CURRENT_TIMESTAMP),
  ('a1100000-0000-4000-8000-000000000010', 'c1000000-0000-4000-8000-000000000004', 'LYCEE_TERMINALE', 'Terminale', 'Tle', 43, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Catalogue types de frais (doc §3) — plateforme uniquement
INSERT INTO "strk_fee_types" ("id", "institution_id", "code", "label", "category", "frequency", "sort_order", "updated_at")
VALUES
  ('f1000000-0000-4000-8000-000000000001', NULL, 'STATE_REGISTRATION', 'Inscription nationale en ligne', 'official', 'annual', 10, CURRENT_TIMESTAMP),
  ('f1000000-0000-4000-8000-000000000002', NULL, 'APPLICATION_FEE', 'Frais de dossier', 'enrollment', 'one_time', 20, CURRENT_TIMESTAMP),
  ('f1000000-0000-4000-8000-000000000003', NULL, 'PRE_REGISTRATION', 'Préinscription', 'enrollment', 'one_time', 30, CURRENT_TIMESTAMP),
  ('f1000000-0000-4000-8000-000000000004', NULL, 'FIRST_REGISTRATION', 'Première inscription', 'enrollment', 'one_time', 40, CURRENT_TIMESTAMP),
  ('f1000000-0000-4000-8000-000000000005', NULL, 'RE_REGISTRATION', 'Réinscription', 'enrollment', 'annual', 50, CURRENT_TIMESTAMP),
  ('f1000000-0000-4000-8000-000000000006', NULL, 'TRANSFER_FEE', 'Frais de transfert', 'enrollment', 'one_time', 60, CURRENT_TIMESTAMP),
  ('f1000000-0000-4000-8000-000000000007', NULL, 'ANNUAL_TUITION', 'Scolarité annuelle', 'tuition', 'annual', 70, CURRENT_TIMESTAMP),
  ('f1000000-0000-4000-8000-000000000008', NULL, 'MONTHLY_TUITION', 'Mensualité scolaire', 'tuition', 'monthly', 80, CURRENT_TIMESTAMP),
  ('f1000000-0000-4000-8000-000000000009', NULL, 'INSURANCE', 'Assurance scolaire', 'service', 'annual', 90, CURRENT_TIMESTAMP),
  ('f1000000-0000-4000-8000-00000000000a', NULL, 'STUDENT_CARD', 'Carte scolaire', 'admin', 'annual', 100, CURRENT_TIMESTAMP),
  ('f1000000-0000-4000-8000-00000000000b', NULL, 'REPORT_CARD', 'Carnet ou bulletin', 'admin', 'annual', 110, CURRENT_TIMESTAMP),
  ('f1000000-0000-4000-8000-00000000000c', NULL, 'PARENTS_ASSOCIATION', 'Association des parents', 'association', 'annual', 120, CURRENT_TIMESTAMP),
  ('f1000000-0000-4000-8000-00000000000d', NULL, 'UNIFORM', 'Uniforme scolaire', 'equipment', 'one_time', 130, CURRENT_TIMESTAMP),
  ('f1000000-0000-4000-8000-00000000000e', NULL, 'SPORT_UNIFORM', 'Tenue de sport', 'equipment', 'one_time', 140, CURRENT_TIMESTAMP),
  ('f1000000-0000-4000-8000-00000000000f', NULL, 'SCHOOL_SUPPLIES', 'Fournitures scolaires', 'equipment', 'one_time', 150, CURRENT_TIMESTAMP),
  ('f1000000-0000-4000-8000-000000000010', NULL, 'BOOKS', 'Manuels scolaires', 'equipment', 'one_time', 160, CURRENT_TIMESTAMP),
  ('f1000000-0000-4000-8000-000000000011', NULL, 'CANTEEN', 'Cantine', 'service', 'periodic', 170, CURRENT_TIMESTAMP),
  ('f1000000-0000-4000-8000-000000000012', NULL, 'TRANSPORT', 'Transport scolaire', 'service', 'periodic', 180, CURRENT_TIMESTAMP),
  ('f1000000-0000-4000-8000-000000000013', NULL, 'ACTIVITIES', 'Activités extrascolaires', 'service', 'one_time', 190, CURRENT_TIMESTAMP),
  ('f1000000-0000-4000-8000-000000000014', NULL, 'EXAM_FEE', 'Frais d''examen', 'exam', 'one_time', 200, CURRENT_TIMESTAMP),
  ('f1000000-0000-4000-8000-000000000015', NULL, 'MEDICAL_VISIT', 'Visite médicale', 'service', 'annual', 210, CURRENT_TIMESTAMP),
  ('f1000000-0000-4000-8000-000000000016', NULL, 'LATE_PENALTY', 'Pénalité de retard', 'penalty', 'one_time', 220, CURRENT_TIMESTAMP),
  ('f1000000-0000-4000-8000-000000000017', NULL, 'OTHER_FEE', 'Autres frais', 'misc', 'configurable', 230, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
