-- AlterEnum
ALTER TYPE "EmailTemplate" ADD VALUE 'welcome';
ALTER TYPE "EmailTemplate" ADD VALUE 'plan_expiring';
ALTER TYPE "EmailTemplate" ADD VALUE 'plan_expired';
ALTER TYPE "EmailTemplate" ADD VALUE 'activity_digest';
ALTER TYPE "EmailTemplate" ADD VALUE 'comeback';
ALTER TYPE "EmailTemplate" ADD VALUE 'admin_weekly_summary';

-- AlterTable
ALTER TABLE "users" ADD COLUMN "last_seen_at" TIMESTAMP(3);

-- Backfill: treat existing users as "seen at registration" so the comeback
-- cron doesn't email an entire dormant userbase on first run.
UPDATE "users" SET "last_seen_at" = "updated_at" WHERE "last_seen_at" IS NULL;

-- Index used by the comeback cron to find users inactive for > N days.
CREATE INDEX "users_last_seen_at_idx" ON "users"("last_seen_at");

-- Index used by the plan_expiring / plan_expired crons.
CREATE INDEX "users_plan_expires_at_idx" ON "users"("plan_expires_at");
