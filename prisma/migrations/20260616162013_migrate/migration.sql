/*
  Warnings:

  - You are about to drop the `_CategoryToRol` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "_CategoryToRol" DROP CONSTRAINT "_CategoryToRol_A_fkey";

-- DropForeignKey
ALTER TABLE "_CategoryToRol" DROP CONSTRAINT "_CategoryToRol_B_fkey";

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "pin" DROP NOT NULL,
ALTER COLUMN "pin" DROP DEFAULT,
ALTER COLUMN "pin" SET DATA TYPE TEXT;

-- DropTable
DROP TABLE "_CategoryToRol";
