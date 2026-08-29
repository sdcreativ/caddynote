-- Relance auto des dossiers d'admission incomplets (cron pièces).
ALTER TABLE "strk_admission_applications"
ADD COLUMN IF NOT EXISTS "packet_reminded_at" TIMESTAMP(3);
