-- RBAC administration plateforme SDCREATIV
CREATE TABLE "strk_platform_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 3,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strk_platform_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "strk_platform_roles_code_key" ON "strk_platform_roles"("code");

CREATE TABLE "strk_platform_permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strk_platform_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "strk_platform_permissions_code_key" ON "strk_platform_permissions"("code");
CREATE INDEX "strk_platform_permissions_domain_idx" ON "strk_platform_permissions"("domain");

CREATE TABLE "strk_platform_role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "strk_platform_role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

CREATE TABLE "strk_platform_user_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "country_code" VARCHAR(2),
    "expires_at" TIMESTAMP(3),
    "granted_by" UUID,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strk_platform_user_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "strk_platform_user_roles_user_id_role_id_key" ON "strk_platform_user_roles"("user_id", "role_id");
CREATE INDEX "strk_platform_user_roles_user_id_idx" ON "strk_platform_user_roles"("user_id");
CREATE INDEX "strk_platform_user_roles_role_id_idx" ON "strk_platform_user_roles"("role_id");
CREATE INDEX "strk_platform_user_roles_expires_at_idx" ON "strk_platform_user_roles"("expires_at");

ALTER TABLE "strk_platform_role_permissions" ADD CONSTRAINT "strk_platform_role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "strk_platform_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strk_platform_role_permissions" ADD CONSTRAINT "strk_platform_role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "strk_platform_permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strk_platform_user_roles" ADD CONSTRAINT "strk_platform_user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "strk_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strk_platform_user_roles" ADD CONSTRAINT "strk_platform_user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "strk_platform_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strk_platform_user_roles" ADD CONSTRAINT "strk_platform_user_roles_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "strk_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
