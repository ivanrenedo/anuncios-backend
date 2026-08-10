-- CreateEnum
CREATE TYPE "PlanCycle" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "BumpCadence" AS ENUM ('WEEKLY', 'DAILY');

-- AlterEnum
ALTER TYPE "UserPlan" ADD VALUE 'BASIC';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "price_reduced_until" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "business_verified_at" TIMESTAMP(3),
ADD COLUMN     "plan_cycle" "PlanCycle" NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN     "plan_started_at" TIMESTAMP(3),
ADD COLUMN     "response_time_minutes" INTEGER;

-- AlterTable
ALTER TABLE "verification_requests" ADD COLUMN     "docs" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "plan_activations" (
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

-- CreateTable
CREATE TABLE "pinned_products" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "position" SMALLINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pinned_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_bump_slots" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "cadence" "BumpCadence" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auto_bump_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "premium_carousel_days" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "product_ids" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "premium_carousel_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follower_notify_batches" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "batched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "product_ids" TEXT[],

    CONSTRAINT "follower_notify_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_activations_user_id_activated_at_idx" ON "plan_activations"("user_id", "activated_at");

-- CreateIndex
CREATE INDEX "plan_activations_activated_at_idx" ON "plan_activations"("activated_at");

-- CreateIndex
CREATE UNIQUE INDEX "pinned_products_user_id_position_key" ON "pinned_products"("user_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "pinned_products_user_id_product_id_key" ON "pinned_products"("user_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "auto_bump_slots_product_id_key" ON "auto_bump_slots"("product_id");

-- CreateIndex
CREATE INDEX "auto_bump_slots_user_id_idx" ON "auto_bump_slots"("user_id");

-- CreateIndex
CREATE INDEX "premium_carousel_days_day_idx" ON "premium_carousel_days"("day");

-- CreateIndex
CREATE UNIQUE INDEX "premium_carousel_days_user_id_day_key" ON "premium_carousel_days"("user_id", "day");

-- CreateIndex
CREATE INDEX "follower_notify_batches_user_id_batched_at_idx" ON "follower_notify_batches"("user_id", "batched_at");

-- CreateIndex
CREATE INDEX "products_price_reduced_until_idx" ON "products"("price_reduced_until");

-- CreateIndex
CREATE INDEX "verification_requests_status_created_at_idx" ON "verification_requests"("status", "created_at");

-- AddForeignKey
ALTER TABLE "plan_activations" ADD CONSTRAINT "plan_activations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_activations" ADD CONSTRAINT "plan_activations_activated_by_admin_id_fkey" FOREIGN KEY ("activated_by_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinned_products" ADD CONSTRAINT "pinned_products_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinned_products" ADD CONSTRAINT "pinned_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_bump_slots" ADD CONSTRAINT "auto_bump_slots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_bump_slots" ADD CONSTRAINT "auto_bump_slots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "premium_carousel_days" ADD CONSTRAINT "premium_carousel_days_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follower_notify_batches" ADD CONSTRAINT "follower_notify_batches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
