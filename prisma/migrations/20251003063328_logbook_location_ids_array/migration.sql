/*
  Warnings:

  - You are about to drop the column `location_id` on the `LogbookEntry` table. All the data in the column will be lost.
  - Added the required column `type` to the `Asset` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."LogbookEntry" DROP CONSTRAINT "LogbookEntry_location_id_fkey";

-- AlterTable
CREATE SEQUENCE "public".asset_asset_id_seq;
ALTER TABLE "public"."Asset" ADD COLUMN     "type" INTEGER NOT NULL,
ALTER COLUMN "asset_id" SET DEFAULT nextval('"public".asset_asset_id_seq');
ALTER SEQUENCE "public".asset_asset_id_seq OWNED BY "public"."Asset"."asset_id";

-- AlterTable
ALTER TABLE "public"."Location" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "public"."LocationPhoto" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "public"."LogbookEntry" DROP COLUMN "location_id",
ADD COLUMN     "location_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- AlterTable
ALTER TABLE "public"."Review" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "JourneyLocation_journey_id_idx" ON "public"."JourneyLocation"("journey_id");

-- CreateIndex
CREATE INDEX "JourneyLocation_location_id_idx" ON "public"."JourneyLocation"("location_id");

-- CreateIndex
CREATE INDEX "Like_logbook_id_idx" ON "public"."Like"("logbook_id");

-- CreateIndex
CREATE INDEX "Like_user_id_idx" ON "public"."Like"("user_id");

-- CreateIndex
CREATE INDEX "LogbookEntry_user_id_idx" ON "public"."LogbookEntry"("user_id");

-- CreateIndex
CREATE INDEX "LogbookEntry_journey_id_idx" ON "public"."LogbookEntry"("journey_id");

-- CreateIndex
CREATE INDEX "Review_user_id_idx" ON "public"."Review"("user_id");

-- CreateIndex
CREATE INDEX "Review_location_id_idx" ON "public"."Review"("location_id");

-- CreateIndex
CREATE INDEX "Review_logbook_id_idx" ON "public"."Review"("logbook_id");

-- CreateIndex
CREATE INDEX "Scrap_logbook_id_idx" ON "public"."Scrap"("logbook_id");

-- CreateIndex
CREATE INDEX "Scrap_user_id_idx" ON "public"."Scrap"("user_id");
