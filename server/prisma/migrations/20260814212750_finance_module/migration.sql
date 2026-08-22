-- CreateTable
CREATE TABLE "strk_fee_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "academic_year" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strk_fee_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'issued',
    "total_cents" INTEGER NOT NULL,
    "paid_cents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "due_date" TIMESTAMP(3),
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strk_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_invoice_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_id" UUID NOT NULL,
    "fee_item_id" UUID,
    "label" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "strk_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "provider" TEXT,
    "provider_ref" TEXT,
    "provider_payment_id" TEXT,
    "paid_at" TIMESTAMP(3),
    "paid_by" UUID,
    "receipt_number" TEXT,
    "verification_token" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strk_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_refunds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "reason" TEXT,
    "refunded_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strk_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "strk_invoices_invoice_number_key" ON "strk_invoices"("invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "strk_payments_provider_ref_key" ON "strk_payments"("provider_ref");

-- CreateIndex
CREATE UNIQUE INDEX "strk_payments_receipt_number_key" ON "strk_payments"("receipt_number");

-- CreateIndex
CREATE UNIQUE INDEX "strk_payments_verification_token_key" ON "strk_payments"("verification_token");

-- AddForeignKey
ALTER TABLE "strk_fee_items" ADD CONSTRAINT "strk_fee_items_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_invoices" ADD CONSTRAINT "strk_invoices_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_invoices" ADD CONSTRAINT "strk_invoices_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "strk_students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_invoices" ADD CONSTRAINT "strk_invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "strk_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_invoice_lines" ADD CONSTRAINT "strk_invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "strk_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_invoice_lines" ADD CONSTRAINT "strk_invoice_lines_fee_item_id_fkey" FOREIGN KEY ("fee_item_id") REFERENCES "strk_fee_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_payments" ADD CONSTRAINT "strk_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "strk_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_payments" ADD CONSTRAINT "strk_payments_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "strk_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_refunds" ADD CONSTRAINT "strk_refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "strk_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_refunds" ADD CONSTRAINT "strk_refunds_refunded_by_fkey" FOREIGN KEY ("refunded_by") REFERENCES "strk_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
