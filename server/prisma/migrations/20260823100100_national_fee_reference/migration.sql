-- Lot 1 / 2 : référentiel national CI (données État — pas d'admin CRUD plateforme).
-- Montants 2026-2027 : 0 / 6000 / 3000 (entiers, devise XOF) — seed, pas hardcode runtime.

CREATE TABLE IF NOT EXISTS "strk_national_fee_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "country_code" TEXT NOT NULL,
  "academic_year" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'XOF',
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "effective_from" TIMESTAMP(3) NOT NULL,
  "managed_by" TEXT NOT NULL DEFAULT 'state_ci',
  "source" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strk_national_fee_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "strk_national_fee_versions_country_code_academic_year_version_key"
  ON "strk_national_fee_versions"("country_code", "academic_year", "version");

CREATE INDEX IF NOT EXISTS "strk_national_fee_versions_country_code_academic_year_status_idx"
  ON "strk_national_fee_versions"("country_code", "academic_year", "status");

CREATE TABLE IF NOT EXISTS "strk_national_fee_rates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "version_id" UUID NOT NULL,
  "cycle_code" TEXT NOT NULL,
  "funding_sector" TEXT NOT NULL,
  "fee_type_code" TEXT NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'XOF',
  CONSTRAINT "strk_national_fee_rates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "strk_national_fee_rates_version_cycle_sector_type_key"
  ON "strk_national_fee_rates"("version_id", "cycle_code", "funding_sector", "fee_type_code");

CREATE INDEX IF NOT EXISTS "strk_national_fee_rates_version_id_idx"
  ON "strk_national_fee_rates"("version_id");

DO $$ BEGIN
  ALTER TABLE "strk_national_fee_rates"
    ADD CONSTRAINT "strk_national_fee_rates_version_id_fkey"
    FOREIGN KEY ("version_id") REFERENCES "strk_national_fee_versions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO "strk_national_fee_versions" (
  "id", "country_code", "academic_year", "currency", "version", "status",
  "effective_from", "managed_by", "source", "notes", "updated_at"
) VALUES (
  'b1000000-0000-4000-8000-000000000001',
  'CI',
  '2026-2027',
  'XOF',
  1,
  'published',
  TIMESTAMP '2026-08-01 00:00:00',
  'state_ci',
  'MEN_CI_reference_2026_2027',
  'Référentiel national ivoirien — administré par l''État, importé en seed (pas par super-admin plateforme).',
  CURRENT_TIMESTAMP
) ON CONFLICT ("country_code", "academic_year", "version") DO NOTHING;

INSERT INTO "strk_national_fee_rates" (
  "id", "version_id", "cycle_code", "funding_sector", "fee_type_code", "amount_cents", "currency"
) VALUES
  ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'PRESCHOOL', 'public', 'STATE_REGISTRATION', 0, 'XOF'),
  ('b2000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'PRESCHOOL', 'private', 'STATE_REGISTRATION', 0, 'XOF'),
  ('b2000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000001', 'PRIMARY', 'public', 'STATE_REGISTRATION', 0, 'XOF'),
  ('b2000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000001', 'PRIMARY', 'private', 'STATE_REGISTRATION', 0, 'XOF'),
  ('b2000000-0000-4000-8000-000000000005', 'b1000000-0000-4000-8000-000000000001', 'COLLEGE', 'public', 'STATE_REGISTRATION', 6000, 'XOF'),
  ('b2000000-0000-4000-8000-000000000006', 'b1000000-0000-4000-8000-000000000001', 'COLLEGE', 'private', 'STATE_REGISTRATION', 3000, 'XOF'),
  ('b2000000-0000-4000-8000-000000000007', 'b1000000-0000-4000-8000-000000000001', 'LYCEE', 'public', 'STATE_REGISTRATION', 6000, 'XOF'),
  ('b2000000-0000-4000-8000-000000000008', 'b1000000-0000-4000-8000-000000000001', 'LYCEE', 'private', 'STATE_REGISTRATION', 3000, 'XOF')
ON CONFLICT DO NOTHING;
