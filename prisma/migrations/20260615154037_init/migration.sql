-- CreateEnum
CREATE TYPE "PermissionAcces" AS ENUM ('GRANTED', 'DENIED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "permission" "PermissionAcces" NOT NULL DEFAULT 'DENIED',
ADD COLUMN     "pin" VARCHAR(6) NOT NULL DEFAULT '246810';
