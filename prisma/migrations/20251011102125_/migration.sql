/*
  Warnings:

  - Made the column `theme` on table `Character` required. This step will fail if there are existing NULL values in that column.
  - Made the column `gender` on table `Character` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "public"."User" DROP CONSTRAINT "User_current_character_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."UserCharacter" DROP CONSTRAINT "UserCharacter_character_id_fkey";

-- AlterTable
ALTER TABLE "public"."Character" ALTER COLUMN "theme" SET NOT NULL,
ALTER COLUMN "gender" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_current_character_id_fkey" FOREIGN KEY ("current_character_id") REFERENCES "public"."Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserCharacter" ADD CONSTRAINT "UserCharacter_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
