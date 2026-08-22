-- COM / §5.10 : use_case sur le journal pour le rapport de délivrance campagnes.
ALTER TABLE "strk_communication_logs" ADD COLUMN IF NOT EXISTS "use_case" TEXT;
CREATE INDEX IF NOT EXISTS "strk_communication_logs_use_case_requested_at_idx"
  ON "strk_communication_logs" ("use_case", "requested_at");
