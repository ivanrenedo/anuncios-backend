-- DropIndex
DROP INDEX "product_views_product_id_viewer_key_key";

-- CreateIndex
CREATE INDEX "product_views_product_id_viewer_key_viewed_at_idx" ON "product_views"("product_id", "viewer_key", "viewed_at");

-- CreateIndex
CREATE INDEX "product_views_viewed_at_idx" ON "product_views"("viewed_at");
