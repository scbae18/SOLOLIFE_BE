/*
  Warnings:

  - A unique constraint covering the columns `[google_place_id]` on the table `Location` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."Location" ADD COLUMN     "fallback_photo_url" TEXT,
ADD COLUMN     "google_place_id" TEXT,
ADD COLUMN     "photo_attribution" JSONB,
ADD COLUMN     "photo_reference" TEXT,
ADD COLUMN     "thumbnail_url" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Location_google_place_id_key" ON "public"."Location"("google_place_id");
