-- DropForeignKey
ALTER TABLE "menus" DROP CONSTRAINT "menus_parentId_fkey";

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
