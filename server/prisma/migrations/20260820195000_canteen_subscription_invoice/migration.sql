-- P2-C / S1 : lien abonnement cantine → facture finance
ALTER TABLE "strk_canteen_subscriptions" ADD COLUMN "invoice_id" UUID;

CREATE UNIQUE INDEX "strk_canteen_subscriptions_invoice_id_key" ON "strk_canteen_subscriptions"("invoice_id");

CREATE INDEX "strk_canteen_subscriptions_student_id_status_idx" ON "strk_canteen_subscriptions"("student_id", "status");

ALTER TABLE "strk_canteen_subscriptions" ADD CONSTRAINT "strk_canteen_subscriptions_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "strk_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
