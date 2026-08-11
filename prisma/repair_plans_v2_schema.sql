docker exec -i marketplace_postgres psql -U marketplace -d marketplace <<'SQL'
-- === plans v2 schema (migración 20260808204057) ============================

-- Enums nuevos
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlanCycle') THEN
    CREATE TYPE "PlanCycle" AS ENUM ('MONTHLY', 'YEARLY');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BumpCadence') THEN
    CREATE TYPE "BumpCadence" AS ENUM ('WEEKLY', 'DAILY');
  END IF;
END $$;

-- Añadir BASIC al enum existente
ALTER TYPE "UserPlan" ADD VALUE IF NOT EXISTS 'BASIC';

-- Columnas nuevas
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "price_reduced_until" TIMESTAMP(3);
ALTER TABLE "users"    ADD COLUMN IF NOT EXISTS "business_verified_at" TIMESTAMP(3);
ALTER TABLE "users"    ADD COLUMN IF NOT EXISTS "plan_cycle" "PlanCycle" NOT NULL DEFAULT 'MONTHLY';
ALTER TABLE "users"    ADD COLUMN IF NOT EXISTS "plan_started_at" TIMESTAMP(3);
ALTER TABLE "users"    ADD COLUMN IF NOT EXISTS "response_time_minutes" INTEGER;
ALTER TABLE "verification_requests" ADD COLUMN IF NOT EXISTS "docs" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Tablas nuevas
CREATE TABLE IF NOT EXISTS "plan_activations" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "plan" "UserPlan" NOT NULL,
  "months" SMALLINT NOT NULL,
  "unit_price" DECIMAL(12,2) NOT NULL,
  "discount_pct" DECIMAL(5,4) NOT NULL,
  "total_paid" DECIMAL(12,2) NOT NULL,
  "activated_by_admin_id" TEXT,
  "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "starts_at" TIMESTAMP(3) NOT NULL,
  "ends_at" TIMESTAMP(3) NOT NULL,
  "notes" VARCHAR(500),
  CONSTRAINT "plan_activations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pinned_products" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "position" SMALLINT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pinned_products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "auto_bump_slots" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "cadence" "BumpCadence" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auto_bump_slots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "premium_carousel_days" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "product_ids" TEXT[],
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "premium_carousel_days_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "follower_notify_batches" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "batched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "product_ids" TEXT[],
  CONSTRAINT "follower_notify_batches_pkey" PRIMARY KEY ("id")
);

-- Índices
CREATE INDEX IF NOT EXISTS "plan_activations_user_id_activated_at_idx" ON "plan_activations"("user_id", "activated_at");
CREATE INDEX IF NOT EXISTS "plan_activations_activated_at_idx" ON "plan_activations"("activated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "pinned_products_user_id_position_key" ON "pinned_products"("user_id", "position");
CREATE UNIQUE INDEX IF NOT EXISTS "pinned_products_user_id_product_id_key" ON "pinned_products"("user_id", "product_id");
CREATE UNIQUE INDEX IF NOT EXISTS "auto_bump_slots_product_id_key" ON "auto_bump_slots"("product_id");
CREATE INDEX IF NOT EXISTS "auto_bump_slots_user_id_idx" ON "auto_bump_slots"("user_id");
CREATE INDEX IF NOT EXISTS "premium_carousel_days_day_idx" ON "premium_carousel_days"("day");
CREATE UNIQUE INDEX IF NOT EXISTS "premium_carousel_days_user_id_day_key" ON "premium_carousel_days"("user_id", "day");
CREATE INDEX IF NOT EXISTS "follower_notify_batches_user_id_batched_at_idx" ON "follower_notify_batches"("user_id", "batched_at");
CREATE INDEX IF NOT EXISTS "products_price_reduced_until_idx" ON "products"("price_reduced_until");
CREATE INDEX IF NOT EXISTS "verification_requests_status_created_at_idx" ON "verification_requests"("status", "created_at");

-- Foreign keys (una a una, con guard)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_activations_user_id_fkey') THEN
    ALTER TABLE "plan_activations" ADD CONSTRAINT "plan_activations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_activations_activated_by_admin_id_fkey') THEN
    ALTER TABLE "plan_activations" ADD CONSTRAINT "plan_activations_activated_by_admin_id_fkey" FOREIGN KEY ("activated_by_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pinned_products_user_id_fkey') THEN
    ALTER TABLE "pinned_products" ADD CONSTRAINT "pinned_products_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pinned_products_product_id_fkey') THEN
    ALTER TABLE "pinned_products" ADD CONSTRAINT "pinned_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auto_bump_slots_user_id_fkey') THEN
    ALTER TABLE "auto_bump_slots" ADD CONSTRAINT "auto_bump_slots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auto_bump_slots_product_id_fkey') THEN
    ALTER TABLE "auto_bump_slots" ADD CONSTRAINT "auto_bump_slots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'premium_carousel_days_user_id_fkey') THEN
    ALTER TABLE "premium_carousel_days" ADD CONSTRAINT "premium_carousel_days_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'follower_notify_batches_user_id_fkey') THEN
    ALTER TABLE "follower_notify_batches" ADD CONSTRAINT "follower_notify_batches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- === product_views multi-events (migración 20260809190925) =================
DROP INDEX IF EXISTS "product_views_product_id_viewer_key_key";
CREATE INDEX IF NOT EXISTS "product_views_product_id_viewer_key_viewed_at_idx" ON "product_views"("product_id", "viewer_key", "viewed_at");
CREATE INDEX IF NOT EXISTS "product_views_viewed_at_idx" ON "product_views"("viewed_at");
SQL