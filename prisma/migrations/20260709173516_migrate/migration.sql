-- CreateEnum
CREATE TYPE "UserPlan" AS ENUM ('FREE', 'STAR', 'PREMIUM');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "plan" "UserPlan" NOT NULL DEFAULT 'FREE',
ADD COLUMN     "plan_expires_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "plan_changes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "old_plan" "UserPlan" NOT NULL,
    "new_plan" "UserPlan" NOT NULL,
    "expires_at" TIMESTAMP(3),
    "reason" VARCHAR(500),
    "changed_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_changes_user_id_idx" ON "plan_changes"("user_id");

-- AddForeignKey
ALTER TABLE "plan_changes" ADD CONSTRAINT "plan_changes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_changes" ADD CONSTRAINT "plan_changes_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
