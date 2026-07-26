-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('image', 'video');

-- AlterTable
ALTER TABLE "product_images" ADD COLUMN     "thumbnail_url" TEXT,
ADD COLUMN     "type" "MediaType" NOT NULL DEFAULT 'image';
