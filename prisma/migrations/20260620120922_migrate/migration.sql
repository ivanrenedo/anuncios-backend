/*
  Warnings:

  - The values [report] on the enum `NotificationType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `resolution_note` on the `reports` table. All the data in the column will be lost.
  - You are about to drop the column `reviewed_at` on the `reports` table. All the data in the column will be lost.
  - You are about to drop the column `reviewed_by_id` on the `reports` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "NotificationType_new" AS ENUM ('like', 'price', 'verified', 'follow', 'marketing');
ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "NotificationType_new" USING ("type"::text::"NotificationType_new");
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";
DROP TYPE "NotificationType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "reports" DROP CONSTRAINT "reports_reviewed_by_id_fkey";

-- AlterTable
ALTER TABLE "reports" DROP COLUMN "resolution_note",
DROP COLUMN "reviewed_at",
DROP COLUMN "reviewed_by_id";
