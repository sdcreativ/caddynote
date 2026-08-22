-- PRS-003 : identifiant client pour la synchronisation hors-ligne idempotente
ALTER TABLE "strk_absences" ADD COLUMN "client_id" TEXT;
CREATE UNIQUE INDEX "strk_absences_client_id_key" ON "strk_absences"("client_id");
