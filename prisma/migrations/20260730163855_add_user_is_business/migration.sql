-- AlterTable
ALTER TABLE "users" ADD COLUMN "is_business" BOOLEAN NOT NULL DEFAULT false;

-- Data: flag the business owner account so `businessContact` resolves to it.
-- No-op on fresh installs where the user hasn't been seeded yet.
UPDATE "users" SET "is_business" = true WHERE "email" = 'digitalcorps365@gmail.com';
