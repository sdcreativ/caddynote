-- Unicité e-mail globale insensible à la casse (tous rôles).
-- 1) Déduplique les collisions après lower(trim)
-- 2) Normalise toutes les valeurs
-- 3) Index unique sur lower(email)

WITH ranked AS (
  SELECT
    id,
    lower(trim(email)) AS norm,
    row_number() OVER (
      PARTITION BY lower(trim(email))
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM strk_profiles
  WHERE email IS NOT NULL AND trim(email) <> ''
)
UPDATE strk_profiles AS p
SET
  email = 'dup-' || replace(p.id::text, '-', '') || '@anon.invalid',
  updated_at = NOW()
FROM ranked r
WHERE p.id = r.id AND r.rn > 1;

UPDATE strk_profiles
SET email = lower(trim(email))
WHERE email IS NOT NULL AND email <> lower(trim(email));

CREATE UNIQUE INDEX IF NOT EXISTS strk_profiles_email_lower_uidx
  ON strk_profiles (lower(email))
  WHERE email IS NOT NULL;
