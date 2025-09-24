/*
  Warnings:

  - You are about to drop the column `quest_description` on the `Quest` table. All the data in the column will be lost.
  - You are about to drop the column `quest_title` on the `Quest` table. All the data in the column will be lost.
  - You are about to drop the column `required_level` on the `Quest` table. All the data in the column will be lost.
  - Added the required column `title` to the `Quest` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Quest" DROP COLUMN "quest_description",
DROP COLUMN "quest_title",
DROP COLUMN "required_level",
ADD COLUMN     "reward_points" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "title" TEXT NOT NULL,
ALTER COLUMN "reward_exp" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "assets" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "points" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "title" TEXT NOT NULL DEFAULT '초심자';
