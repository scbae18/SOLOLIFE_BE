/*
  Warnings:

  - The primary key for the `UserCharacter` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `unlocked_at` on the `UserCharacter` table. All the data in the column will be lost.
  - You are about to drop the column `user_character_id` on the `UserCharacter` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "public"."UserCharacter_user_id_character_id_key";

-- AlterTable
ALTER TABLE "public"."UserCharacter" DROP CONSTRAINT "UserCharacter_pkey",
DROP COLUMN "unlocked_at",
DROP COLUMN "user_character_id",
ADD CONSTRAINT "UserCharacter_pkey" PRIMARY KEY ("user_id", "character_id");

-- CreateIndex
CREATE INDEX "UserCharacter_user_id_idx" ON "public"."UserCharacter"("user_id");

-- CreateIndex
CREATE INDEX "UserCharacter_character_id_idx" ON "public"."UserCharacter"("character_id");
