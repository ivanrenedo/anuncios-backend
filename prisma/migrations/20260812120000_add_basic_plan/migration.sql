-- AlterEnum
-- This migration adds the BASIC tier between FREE and STAR to align the DB
-- with the plans catalogue rendered in the web/mobile UIs. `ADD VALUE` cannot
-- run inside an implicit transaction, so Prisma emits it as its own statement.
ALTER TYPE "UserPlan" ADD VALUE 'BASIC' AFTER 'FREE';
