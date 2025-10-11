/*
  Warnings:

  - You are about to drop the column `name` on the `Asset` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `Asset` table. All the data in the column will be lost.
  - You are about to alter the column `image_url` on the `Asset` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - A unique constraint covering the columns `[id]` on the table `Asset` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `group` to the `Asset` table without a default value. This is not possible if the table is not empty.
  - Added the required column `id` to the `Asset` table without a default value. This is not possible if the table is not empty.
  - Added the required column `label` to the `Asset` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Asset" DROP COLUMN "name",
DROP COLUMN "type",
ADD COLUMN     "group" VARCHAR(20) NOT NULL,
ADD COLUMN     "id" VARCHAR(50) NOT NULL,
ADD COLUMN     "label" VARCHAR(100) NOT NULL,
ALTER COLUMN "image_url" SET DATA TYPE VARCHAR(255);

-- AlterTable
ALTER TABLE "public"."User" ALTER COLUMN "current_assets" SET DEFAULT '{"bg1-only": null, "bg23": []}';

-- DropEnum
DROP TYPE "public"."AssetType";

-- CreateIndex
CREATE UNIQUE INDEX "Asset_id_key" ON "public"."Asset"("id");
