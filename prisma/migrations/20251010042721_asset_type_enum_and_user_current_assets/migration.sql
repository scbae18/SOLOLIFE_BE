/*
  Warnings:

  - Changed the type of `type` on the `Asset` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "public"."AssetType" AS ENUM ('TYPE1', 'TYPE2', 'TYPE3');

-- AlterTable
ALTER TABLE "public"."Asset" DROP COLUMN "type",
ADD COLUMN     "type" "public"."AssetType" NOT NULL;

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "current_assets" JSONB DEFAULT '{"TYPE1":1,"TYPE2":2,"TYPE3":3}';
