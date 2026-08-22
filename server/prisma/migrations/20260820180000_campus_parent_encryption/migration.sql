-- Campus natif + liaison parent à la création + chiffrement (métadonnées applicatives)

CREATE TABLE IF NOT EXISTS "strk_campuses" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "institution_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT,
  "phone" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strk_campuses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "strk_campuses_institution_id_code_key"
  ON "strk_campuses"("institution_id", "code");

CREATE INDEX IF NOT EXISTS "strk_campuses_institution_id_idx"
  ON "strk_campuses"("institution_id");

DO $$ BEGIN
  ALTER TABLE "strk_campuses"
    ADD CONSTRAINT "strk_campuses_institution_id_fkey"
    FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "strk_classes"
  ADD COLUMN IF NOT EXISTS "campus_id" UUID;

ALTER TABLE "strk_admission_applications"
  ADD COLUMN IF NOT EXISTS "campus_id" UUID,
  ADD COLUMN IF NOT EXISTS "contact_profile_id" UUID;

ALTER TABLE "strk_admission_packet_templates"
  ADD COLUMN IF NOT EXISTS "campus_id" UUID;

-- Backfill campuses from legacy free-text (distinct non-empty values)
INSERT INTO "strk_campuses" ("institution_id", "code", "name", "sort_order")
SELECT DISTINCT ON (a."institution_id", lower(regexp_replace(trim(a."campus"), '[^a-zA-Z0-9]+', '_', 'g')))
  a."institution_id",
  left(lower(regexp_replace(trim(a."campus"), '[^a-zA-Z0-9]+', '_', 'g')), 64),
  trim(a."campus"),
  0
FROM "strk_admission_applications" a
WHERE a."campus" IS NOT NULL AND trim(a."campus") <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "strk_campuses" c
    WHERE c."institution_id" = a."institution_id"
      AND c."code" = left(lower(regexp_replace(trim(a."campus"), '[^a-zA-Z0-9]+', '_', 'g')), 64)
  );

UPDATE "strk_admission_applications" a
SET "campus_id" = c."id"
FROM "strk_campuses" c
WHERE a."campus_id" IS NULL
  AND a."campus" IS NOT NULL
  AND c."institution_id" = a."institution_id"
  AND lower(c."name") = lower(trim(a."campus"));

DO $$ BEGIN
  ALTER TABLE "strk_classes"
    ADD CONSTRAINT "strk_classes_campus_id_fkey"
    FOREIGN KEY ("campus_id") REFERENCES "strk_campuses"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "strk_admission_applications"
    ADD CONSTRAINT "strk_admission_applications_campus_id_fkey"
    FOREIGN KEY ("campus_id") REFERENCES "strk_campuses"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "strk_admission_applications"
    ADD CONSTRAINT "strk_admission_applications_contact_profile_id_fkey"
    FOREIGN KEY ("contact_profile_id") REFERENCES "strk_profiles"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "strk_admission_packet_templates"
    ADD CONSTRAINT "strk_admission_packet_templates_campus_id_fkey"
    FOREIGN KEY ("campus_id") REFERENCES "strk_campuses"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "strk_admission_applications_campus_id_idx"
  ON "strk_admission_applications"("campus_id");
CREATE INDEX IF NOT EXISTS "strk_admission_applications_contact_profile_id_idx"
  ON "strk_admission_applications"("contact_profile_id");
