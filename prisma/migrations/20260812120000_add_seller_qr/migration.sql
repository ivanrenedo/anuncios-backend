-- AlterTable: QR-card visibility toggles on User. Default false so no existing
-- seller starts exposing phone/email on their printable card.
ALTER TABLE "users"
  ADD COLUMN "qr_show_phone" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "qr_show_email" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: event log for QR-driven profile visits.
CREATE TABLE "seller_qr_scans" (
    "id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "source" VARCHAR(20) NOT NULL DEFAULT 'qr',
    "visitor_hash" VARCHAR(64),
    "user_agent" VARCHAR(300),
    "ip_hash" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_qr_scans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: monthly / last-30d aggregates by seller.
CREATE INDEX "seller_qr_scans_seller_id_created_at_idx"
  ON "seller_qr_scans"("seller_id", "created_at");

-- CreateIndex: 30-min dedup lookup by (seller, visitor).
CREATE INDEX "seller_qr_scans_seller_id_visitor_hash_created_at_idx"
  ON "seller_qr_scans"("seller_id", "visitor_hash", "created_at");

-- AddForeignKey: cascade delete of scans when the seller row is removed.
ALTER TABLE "seller_qr_scans"
  ADD CONSTRAINT "seller_qr_scans_seller_id_fkey"
  FOREIGN KEY ("seller_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
