-- Contact démo : rattachement optionnel à l’établissement provisionné.
ALTER TABLE "strk_contact_messages"
  ADD COLUMN IF NOT EXISTS "converted_institution_id" UUID;
