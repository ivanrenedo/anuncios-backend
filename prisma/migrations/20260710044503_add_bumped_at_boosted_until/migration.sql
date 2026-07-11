-- AlterTable
ALTER TABLE "products" ADD COLUMN     "boosted_until" TIMESTAMP(3),
ADD COLUMN     "bumped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "products_bumped_at_idx" ON "products"("bumped_at");

-- CreateIndex
CREATE INDEX "products_boosted_until_idx" ON "products"("boosted_until");
