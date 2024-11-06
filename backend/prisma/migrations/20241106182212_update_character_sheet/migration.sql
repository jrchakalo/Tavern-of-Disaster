/*
  Warnings:

  - You are about to drop the column `cd` on the `CharacterSheet` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CharacterSheet" DROP COLUMN "cd",
ADD COLUMN     "ac" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "hp" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "prof" TEXT[],
ADD COLUMN     "subSpecies" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "traits" TEXT NOT NULL DEFAULT '';
