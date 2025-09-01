/*
  Warnings:

  - You are about to alter the column `latitude` on the `Location` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(9,6)`.
  - You are about to alter the column `longitude` on the `Location` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(9,6)`.
  - A unique constraint covering the columns `[dedupe_signature]` on the table `Location` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updated_at` to the `Location` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Location" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "dedupe_signature" TEXT,
ADD COLUMN     "features" JSONB,
ADD COLUMN     "keywords" TEXT[],
ADD COLUMN     "price_level" INTEGER,
ADD COLUMN     "rating_avg" DECIMAL(3,2),
ADD COLUMN     "rating_count" INTEGER,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "latitude" SET DATA TYPE DECIMAL(9,6),
ALTER COLUMN "longitude" SET DATA TYPE DECIMAL(9,6);

-- CreateIndex
CREATE UNIQUE INDEX "Location_dedupe_signature_key" ON "public"."Location"("dedupe_signature");

-- CreateIndex
CREATE INDEX "Location_latitude_longitude_idx" ON "public"."Location"("latitude", "longitude");
