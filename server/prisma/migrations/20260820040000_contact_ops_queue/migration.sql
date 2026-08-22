-- §5.16 P2 — file ops pour messages contact publics
ALTER TABLE "strk_contact_messages"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS "converted_ticket_id" UUID,
  ADD COLUMN IF NOT EXISTS "handled_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "handled_by" UUID;

CREATE INDEX IF NOT EXISTS "strk_contact_messages_status_idx" ON "strk_contact_messages" ("status");
