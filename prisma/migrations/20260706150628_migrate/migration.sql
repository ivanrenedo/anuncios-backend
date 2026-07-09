/*
  Warnings:

  - You are about to drop the column `notif_messages` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "users" DROP COLUMN "notif_messages",
ALTER COLUMN "notif_marketing" SET DEFAULT true,
ALTER COLUMN "show_email" SET DEFAULT true,
ALTER COLUMN "show_phone" SET DEFAULT true;
