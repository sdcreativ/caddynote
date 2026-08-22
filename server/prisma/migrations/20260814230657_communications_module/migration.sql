-- CreateEnum
CREATE TYPE "strk_comm_channel" AS ENUM ('email', 'sms', 'whatsapp', 'push');

-- CreateEnum
CREATE TYPE "strk_comm_status" AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed');

-- CreateTable
CREATE TABLE "strk_message_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID,
    "use_case" TEXT NOT NULL,
    "channel" "strk_comm_channel" NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '[]',
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strk_message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_communication_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profile_id" UUID NOT NULL,
    "channel" "strk_comm_channel" NOT NULL,
    "opted_in" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strk_communication_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_communication_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID,
    "template_id" UUID,
    "channel" "strk_comm_channel" NOT NULL,
    "recipient_id" UUID,
    "to_address" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" "strk_comm_status" NOT NULL DEFAULT 'queued',
    "skipped_opt_out" BOOLEAN NOT NULL DEFAULT false,
    "is_critical" BOOLEAN NOT NULL DEFAULT false,
    "provider_message_id" TEXT,
    "error_message" TEXT,
    "requested_by" UUID NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),

    CONSTRAINT "strk_communication_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "strk_message_templates_institution_id_use_case_channel_loca_key" ON "strk_message_templates"("institution_id", "use_case", "channel", "locale", "version");

-- CreateIndex
CREATE UNIQUE INDEX "strk_communication_preferences_profile_id_channel_key" ON "strk_communication_preferences"("profile_id", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "strk_communication_logs_provider_message_id_key" ON "strk_communication_logs"("provider_message_id");

-- AddForeignKey
ALTER TABLE "strk_message_templates" ADD CONSTRAINT "strk_message_templates_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_message_templates" ADD CONSTRAINT "strk_message_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "strk_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_communication_preferences" ADD CONSTRAINT "strk_communication_preferences_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "strk_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_communication_logs" ADD CONSTRAINT "strk_communication_logs_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_communication_logs" ADD CONSTRAINT "strk_communication_logs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "strk_message_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_communication_logs" ADD CONSTRAINT "strk_communication_logs_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "strk_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_communication_logs" ADD CONSTRAINT "strk_communication_logs_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "strk_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
