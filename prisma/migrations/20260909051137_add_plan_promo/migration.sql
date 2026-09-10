-- CreateTable: platform-wide promotional override for plan entitlements.
-- Single row, primary key fixed to 'singleton' by the application layer.
CREATE TABLE "plan_promo" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "granted_plan" "UserPlan" NOT NULL DEFAULT 'PREMIUM',
    "unlock_limits" BOOLEAN NOT NULL DEFAULT true,
    "unlock_pinned" BOOLEAN NOT NULL DEFAULT true,
    "unlock_auto_bump" BOOLEAN NOT NULL DEFAULT true,
    "unlock_stats" BOOLEAN NOT NULL DEFAULT true,
    "free_boosts" BOOLEAN NOT NULL DEFAULT true,
    "banner_text" VARCHAR(160),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" TEXT,

    CONSTRAINT "plan_promo_pkey" PRIMARY KEY ("id")
);

-- Seed the singleton disabled: existing plan limits keep applying until an
-- admin turns the promo on from the panel.
INSERT INTO "plan_promo" ("id", "enabled") VALUES ('singleton', false)
  ON CONFLICT ("id") DO NOTHING;
