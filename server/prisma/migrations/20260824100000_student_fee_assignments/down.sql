-- Rollback manuel Tranche A — local uniquement sans autorisation staging/prod.

DROP INDEX IF EXISTS "strk_student_fee_assignments_active_student_year_uidx";
DROP TABLE IF EXISTS "strk_student_fee_assignments";
