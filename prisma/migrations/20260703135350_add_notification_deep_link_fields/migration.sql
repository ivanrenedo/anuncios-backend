-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "filter_cat" TEXT,
ADD COLUMN     "related_product_id" TEXT,
ADD COLUMN     "related_user_id" TEXT,
ADD COLUMN     "section_id" TEXT;
