-- CreateTable
CREATE TABLE "strk_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "strk_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "metadata" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strk_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "strk_audit_logs_institution_id_created_at_idx" ON "strk_audit_logs"("institution_id", "created_at");

-- AddForeignKey
ALTER TABLE "strk_sessions" ADD CONSTRAINT "strk_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "strk_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_audit_logs" ADD CONSTRAINT "strk_audit_logs_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_audit_logs" ADD CONSTRAINT "strk_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "strk_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

