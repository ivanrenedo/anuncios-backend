/*
  Warnings:

  - You are about to drop the column `color` on the `marketplace_details` table. All the data in the column will be lost.
  - You are about to drop the column `color` on the `vehicle_details` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "marketplace_details" DROP COLUMN "color",
ADD COLUMN     "colors" VARCHAR(9)[] DEFAULT ARRAY[]::VARCHAR(9)[];

-- AlterTable
ALTER TABLE "vehicle_details" DROP COLUMN "color",
ADD COLUMN     "colors" VARCHAR(9)[] DEFAULT ARRAY[]::VARCHAR(9)[];
