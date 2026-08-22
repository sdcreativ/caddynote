-- Lot 9 modules + storage usage counter (SAA-003)
ALTER TABLE "strk_institutions" ADD COLUMN IF NOT EXISTS "storage_used_bytes" BIGINT NOT NULL DEFAULT 0;

-- Transport
CREATE TABLE IF NOT EXISTS "strk_transport_routes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "institution_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "capacity" INTEGER,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strk_transport_routes_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "strk_transport_enrollments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "route_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "start_date" DATE NOT NULL DEFAULT CURRENT_DATE,
  "end_date" DATE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strk_transport_enrollments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "strk_transport_enrollments_route_student_key" ON "strk_transport_enrollments"("route_id", "student_id");

-- Cantine
CREATE TABLE IF NOT EXISTS "strk_canteen_plans" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "institution_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "price_cents" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'XOF',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strk_canteen_plans_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "strk_canteen_subscriptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "plan_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "start_date" DATE NOT NULL DEFAULT CURRENT_DATE,
  "end_date" DATE,
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strk_canteen_subscriptions_pkey" PRIMARY KEY ("id")
);

-- Bibliothèque
CREATE TABLE IF NOT EXISTS "strk_library_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "institution_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "author" TEXT,
  "isbn" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "available" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strk_library_items_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "strk_library_loans" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "item_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "borrowed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "due_at" TIMESTAMP(3) NOT NULL,
  "returned_at" TIMESTAMP(3),
  CONSTRAINT "strk_library_loans_pkey" PRIMARY KEY ("id")
);

-- Internat
CREATE TABLE IF NOT EXISTS "strk_boarding_rooms" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "institution_id" UUID NOT NULL,
  "label" TEXT NOT NULL,
  "capacity" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strk_boarding_rooms_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "strk_boarding_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "room_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "start_date" DATE NOT NULL DEFAULT CURRENT_DATE,
  "end_date" DATE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strk_boarding_assignments_pkey" PRIMARY KEY ("id")
);

-- Santé scolaire (visites infirmierie — distinct du dossier santé élève)
CREATE TABLE IF NOT EXISTS "strk_clinic_visits" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "institution_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "visit_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reason" TEXT NOT NULL,
  "notes" TEXT,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strk_clinic_visits_pkey" PRIMARY KEY ("id")
);

-- RH (fiches de poste — hors paie)
CREATE TABLE IF NOT EXISTS "strk_hr_staff_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "institution_id" UUID NOT NULL,
  "profile_id" UUID NOT NULL,
  "job_title" TEXT NOT NULL,
  "contract_type" TEXT,
  "start_date" DATE,
  "end_date" DATE,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strk_hr_staff_records_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "strk_hr_staff_records_institution_profile_key" ON "strk_hr_staff_records"("institution_id", "profile_id");

-- Contact public
CREATE TABLE IF NOT EXISTS "strk_contact_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "ip_address" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strk_contact_messages_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "strk_transport_routes" ADD CONSTRAINT "strk_transport_routes_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strk_transport_enrollments" ADD CONSTRAINT "strk_transport_enrollments_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "strk_transport_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strk_canteen_plans" ADD CONSTRAINT "strk_canteen_plans_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strk_canteen_subscriptions" ADD CONSTRAINT "strk_canteen_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "strk_canteen_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strk_library_items" ADD CONSTRAINT "strk_library_items_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strk_library_loans" ADD CONSTRAINT "strk_library_loans_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "strk_library_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strk_boarding_rooms" ADD CONSTRAINT "strk_boarding_rooms_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strk_boarding_assignments" ADD CONSTRAINT "strk_boarding_assignments_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "strk_boarding_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strk_clinic_visits" ADD CONSTRAINT "strk_clinic_visits_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strk_hr_staff_records" ADD CONSTRAINT "strk_hr_staff_records_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strk_hr_staff_records" ADD CONSTRAINT "strk_hr_staff_records_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "strk_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
