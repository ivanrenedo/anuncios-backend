/*
  Warnings:

  - You are about to drop the column `job_type` on the `job_details` table. All the data in the column will be lost.
  - You are about to drop the column `property_type` on the `property_details` table. All the data in the column will be lost.
  - You are about to drop the column `vehicle_type` on the `vehicle_details` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "job_details" DROP COLUMN "job_type";

-- AlterTable
ALTER TABLE "property_details" DROP COLUMN "property_type";

-- AlterTable
ALTER TABLE "vehicle_details" DROP COLUMN "vehicle_type";
