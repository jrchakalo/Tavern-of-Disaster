-- CreateEnum
CREATE TYPE "Role" AS ENUM ('DM', 'PLAYER');

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'PLAYER';
