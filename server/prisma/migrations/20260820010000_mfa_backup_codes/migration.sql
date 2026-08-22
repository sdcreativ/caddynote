-- MFA recovery codes (hashes only — plaintext shown once at enrollment)
ALTER TABLE "strk_profiles"
  ADD COLUMN IF NOT EXISTS "mfa_backup_code_hashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
