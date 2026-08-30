-- Lot 9 planning bus : arrêts + créneaux hebdomadaires
CREATE TABLE IF NOT EXISTS "strk_transport_stops" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "route_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "strk_transport_stops_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "strk_transport_stops_route_id_sequence_key"
  ON "strk_transport_stops"("route_id", "sequence");
CREATE INDEX IF NOT EXISTS "strk_transport_stops_route_id_idx"
  ON "strk_transport_stops"("route_id");

CREATE TABLE IF NOT EXISTS "strk_transport_schedule_slots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "route_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "departure_time" VARCHAR(5) NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'outbound',
    "label" TEXT,
    "stop_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "strk_transport_schedule_slots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "strk_transport_schedule_slots_route_id_day_of_week_idx"
  ON "strk_transport_schedule_slots"("route_id", "day_of_week");

-- Web Push subscriptions
CREATE TABLE IF NOT EXISTS "strk_push_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "strk_push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "strk_push_subscriptions_endpoint_key"
  ON "strk_push_subscriptions"("endpoint");
CREATE INDEX IF NOT EXISTS "strk_push_subscriptions_user_id_idx"
  ON "strk_push_subscriptions"("user_id");

DO $$ BEGIN
  ALTER TABLE "strk_transport_stops"
    ADD CONSTRAINT "strk_transport_stops_route_id_fkey"
    FOREIGN KEY ("route_id") REFERENCES "strk_transport_routes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "strk_transport_schedule_slots"
    ADD CONSTRAINT "strk_transport_schedule_slots_route_id_fkey"
    FOREIGN KEY ("route_id") REFERENCES "strk_transport_routes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "strk_transport_schedule_slots"
    ADD CONSTRAINT "strk_transport_schedule_slots_stop_id_fkey"
    FOREIGN KEY ("stop_id") REFERENCES "strk_transport_stops"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
