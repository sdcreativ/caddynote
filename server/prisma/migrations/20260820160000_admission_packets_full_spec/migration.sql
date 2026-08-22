-- Moteur de pièces — règles conditionnelles, réemploi, fenêtres de dépôt, drapeaux profil

ALTER TABLE "strk_admission_applications"
  ADD COLUMN IF NOT EXISTS "profile_flags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "strk_admission_packet_requirements"
  ADD COLUMN IF NOT EXISTS "condition_rule" JSONB,
  ADD COLUMN IF NOT EXISTS "deposit_opens_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deposit_closes_at" TIMESTAMP(3);

ALTER TABLE "strk_admission_document_items"
  ADD COLUMN IF NOT EXISTS "issued_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "waived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reused_from_item_id" UUID;

ALTER TABLE "strk_admission_document_items"
  ADD CONSTRAINT "strk_admission_document_items_reused_from_item_id_fkey"
  FOREIGN KEY ("reused_from_item_id") REFERENCES "strk_admission_document_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
