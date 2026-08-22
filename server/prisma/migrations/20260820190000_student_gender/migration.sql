-- Genre élève (effectif filles / garçons classe & établissement)
ALTER TABLE "strk_students" ADD COLUMN IF NOT EXISTS "gender" TEXT;

-- Reprise depuis les dossiers d'admission déjà inscrits (valeurs normalisées).
UPDATE "strk_students" s
SET "gender" = CASE
  WHEN lower(trim(a.student_gender)) IN ('female', 'f', 'fille', 'girl', 'féminin', 'feminin') THEN 'female'
  WHEN lower(trim(a.student_gender)) IN ('male', 'm', 'garçon', 'garcon', 'boy', 'masculin') THEN 'male'
  ELSE NULL
END
FROM "strk_admission_applications" a
WHERE a.enrolled_student_id = s.id
  AND a.student_gender IS NOT NULL
  AND s.gender IS NULL;
