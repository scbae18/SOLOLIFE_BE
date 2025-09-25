/*
  Warnings:

  - You are about to drop the column `anchor` on the `Asset` table. All the data in the column will be lost.
  - You are about to drop the column `is_gacha_only` on the `Asset` table. All the data in the column will be lost.
  - You are about to drop the column `meta` on the `Asset` table. All the data in the column will be lost.
  - You are about to drop the column `price_points` on the `Asset` table. All the data in the column will be lost.
  - You are about to drop the column `rarity` on the `Asset` table. All the data in the column will be lost.
  - You are about to drop the column `scale` on the `Asset` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `Asset` table. All the data in the column will be lost.
  - You are about to drop the column `z_index` on the `Asset` table. All the data in the column will be lost.
  - You are about to drop the column `reward_exp` on the `Quest` table. All the data in the column will be lost.
  - You are about to drop the column `experience_points` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `explorer_level` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Asset" DROP COLUMN "anchor",
DROP COLUMN "is_gacha_only",
DROP COLUMN "meta",
DROP COLUMN "price_points",
DROP COLUMN "rarity",
DROP COLUMN "scale",
DROP COLUMN "type",
DROP COLUMN "z_index";

-- AlterTable
ALTER TABLE "public"."Quest" DROP COLUMN "reward_exp";

-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "experience_points",
DROP COLUMN "explorer_level";
