-- CreateEnum
CREATE TYPE "EmailTemplate" AS ENUM ('pin_code', 'plan_activated', 'boost_receipt', 'verification_approved', 'verification_rejected', 'account_suspended');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('queued', 'sent', 'failed', 'bounced');

-- CreateTable
CREATE TABLE "email_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "to_email" VARCHAR(255) NOT NULL,
    "template" "EmailTemplate" NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'queued',
    "provider_msg_id" VARCHAR(200),
    "error" TEXT,
    "dedupe_key" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_logs_dedupe_key_key" ON "email_logs"("dedupe_key");

-- CreateIndex
CREATE INDEX "email_logs_user_id_created_at_idx" ON "email_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "email_logs_status_idx" ON "email_logs"("status");

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
