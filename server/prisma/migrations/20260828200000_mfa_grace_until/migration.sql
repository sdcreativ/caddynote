-- Grâce MFA 7 jours après premier login (rôles sensibles) avant obligation.
ALTER TABLE "strk_profiles"
  ADD COLUMN IF NOT EXISTS "mfa_grace_until" TIMESTAMP(3);
