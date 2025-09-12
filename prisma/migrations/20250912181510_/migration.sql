/*
  Warnings:

  - A unique constraint covering the columns `[logbook_id,location_id]` on the table `Review` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."Review_logbook_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "Review_logbook_id_location_id_key" ON "public"."Review"("logbook_id", "location_id");
