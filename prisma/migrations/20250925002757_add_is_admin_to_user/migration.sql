/*
  Warnings:

  - You are about to drop the column `is_premium` on the `Character` table. All the data in the column will be lost.
  - You are about to drop the column `unlock_level` on the `Character` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Character" DROP COLUMN "is_premium",
DROP COLUMN "unlock_level";
