-- Première connexion : forcer le changement du mot de passe provisoire.
ALTER TABLE "strk_profiles"
  ADD COLUMN IF NOT EXISTS "must_change_password" BOOLEAN NOT NULL DEFAULT false;
