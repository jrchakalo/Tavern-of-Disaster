-- DropForeignKey
ALTER TABLE "Player" DROP CONSTRAINT "Player_tableId_fkey";

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;
