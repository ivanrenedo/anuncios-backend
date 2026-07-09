/*
  Warnings:

  - You are about to drop the column `service_type` on the `service_details` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "property_details" ADD COLUMN     "floor" SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN     "surface" SMALLINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "service_details" DROP COLUMN "service_type";

-- AlterTable
ALTER TABLE "vehicle_details" ADD COLUMN     "kilometrage" SMALLINT;
