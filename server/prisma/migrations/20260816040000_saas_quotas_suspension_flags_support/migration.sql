-- CreateEnum
CREATE TYPE "strk_support_ticket_priority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "strk_support_ticket_status" AS ENUM ('open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed');

-- AlterTable
ALTER TABLE "premium_subscriptions" ADD COLUMN     "suspended_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "strk_institutions" ADD COLUMN     "feature_overrides" JSONB;

-- AlterTable
ALTER TABLE "subscription_plans" ADD COLUMN     "max_sms_per_month" INTEGER,
ADD COLUMN     "max_users" INTEGER;

-- CreateTable
CREATE TABLE "strk_support_tickets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID,
    "created_by" UUID NOT NULL,
    "assigned_to" UUID,
    "subject" TEXT NOT NULL,
    "priority" "strk_support_ticket_priority" NOT NULL DEFAULT 'normal',
    "status" "strk_support_ticket_status" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "strk_support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_support_ticket_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strk_support_ticket_messages_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "strk_support_tickets" ADD CONSTRAINT "strk_support_tickets_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_support_tickets" ADD CONSTRAINT "strk_support_tickets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "strk_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_support_tickets" ADD CONSTRAINT "strk_support_tickets_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "strk_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_support_ticket_messages" ADD CONSTRAINT "strk_support_ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "strk_support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_support_ticket_messages" ADD CONSTRAINT "strk_support_ticket_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "strk_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

