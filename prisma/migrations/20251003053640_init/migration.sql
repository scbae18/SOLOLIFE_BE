-- CreateTable
CREATE TABLE "public"."User" (
    "user_id" SERIAL NOT NULL,
    "username" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_public_profile" BOOLEAN NOT NULL DEFAULT true,
    "current_character_id" INTEGER,
    "onboarding_answers" JSONB,
    "assets" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "points" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL DEFAULT '초심자',
    "total_points_earned" INTEGER NOT NULL DEFAULT 0,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "public"."Character" (
    "character_id" SERIAL NOT NULL,
    "character_name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "image_url" VARCHAR(255),

    CONSTRAINT "Character_pkey" PRIMARY KEY ("character_id")
);

-- CreateTable
CREATE TABLE "public"."UserCharacter" (
    "user_id" INTEGER NOT NULL,
    "character_id" INTEGER NOT NULL,

    CONSTRAINT "UserCharacter_pkey" PRIMARY KEY ("user_id","character_id")
);

-- CreateTable
CREATE TABLE "public"."Asset" (
    "asset_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "image_url" TEXT,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("asset_id")
);

-- CreateTable
CREATE TABLE "public"."Quest" (
    "quest_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "is_main_quest" BOOLEAN NOT NULL DEFAULT false,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "reward_points" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,

    CONSTRAINT "Quest_pkey" PRIMARY KEY ("quest_id")
);

-- CreateTable
CREATE TABLE "public"."Location" (
    "location_id" SERIAL NOT NULL,
    "location_name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "category" TEXT,
    "is_solo_friendly" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dedupe_signature" TEXT,
    "features" JSONB,
    "keywords" TEXT[],
    "price_level" INTEGER,
    "rating_avg" DECIMAL(3,2),
    "rating_count" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "opening_hours" JSONB,
    "features_flat" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fallback_photo_url" TEXT,
    "google_place_id" TEXT,
    "photo_attribution" JSONB,
    "photo_reference" TEXT,
    "thumbnail_url" TEXT,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("location_id")
);

-- CreateTable
CREATE TABLE "public"."LocationLike" (
    "like_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "location_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationLike_pkey" PRIMARY KEY ("like_id")
);

-- CreateTable
CREATE TABLE "public"."LocationPhoto" (
    "id" SERIAL NOT NULL,
    "location_id" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "photo_reference" TEXT NOT NULL,
    "attributions" TEXT[],
    "remote_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Journey" (
    "journey_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "journey_title" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tags" TEXT[],
    "journey_summary" TEXT,

    CONSTRAINT "Journey_pkey" PRIMARY KEY ("journey_id")
);

-- CreateTable
CREATE TABLE "public"."JourneyLocation" (
    "journey_location_id" SERIAL NOT NULL,
    "journey_id" INTEGER NOT NULL,
    "location_id" INTEGER NOT NULL,
    "sequence_number" INTEGER NOT NULL,

    CONSTRAINT "JourneyLocation_pkey" PRIMARY KEY ("journey_location_id")
);

-- CreateTable
CREATE TABLE "public"."LogbookEntry" (
    "logbook_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "journey_id" INTEGER,
    "location_id" INTEGER,
    "entry_title" TEXT NOT NULL,
    "entry_content" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "image_urls" JSONB,

    CONSTRAINT "LogbookEntry_pkey" PRIMARY KEY ("logbook_id")
);

-- CreateTable
CREATE TABLE "public"."Like" (
    "like_id" SERIAL NOT NULL,
    "logbook_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Like_pkey" PRIMARY KEY ("like_id")
);

-- CreateTable
CREATE TABLE "public"."Scrap" (
    "scrap_id" SERIAL NOT NULL,
    "logbook_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Scrap_pkey" PRIMARY KEY ("scrap_id")
);

-- CreateTable
CREATE TABLE "public"."Review" (
    "review_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "location_id" INTEGER NOT NULL,
    "logbook_id" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("review_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "public"."User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "UserCharacter_user_id_idx" ON "public"."UserCharacter"("user_id");

-- CreateIndex
CREATE INDEX "UserCharacter_character_id_idx" ON "public"."UserCharacter"("character_id");

-- CreateIndex
CREATE UNIQUE INDEX "Location_dedupe_signature_key" ON "public"."Location"("dedupe_signature");

-- CreateIndex
CREATE UNIQUE INDEX "Location_google_place_id_key" ON "public"."Location"("google_place_id");

-- CreateIndex
CREATE INDEX "Location_latitude_longitude_idx" ON "public"."Location"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "LocationLike_user_id_idx" ON "public"."LocationLike"("user_id");

-- CreateIndex
CREATE INDEX "LocationLike_location_id_idx" ON "public"."LocationLike"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "LocationLike_user_id_location_id_key" ON "public"."LocationLike"("user_id", "location_id");

-- CreateIndex
CREATE INDEX "LocationPhoto_location_id_idx" ON "public"."LocationPhoto"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "LocationPhoto_location_id_position_key" ON "public"."LocationPhoto"("location_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Like_logbook_id_user_id_key" ON "public"."Like"("logbook_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "Scrap_logbook_id_user_id_key" ON "public"."Scrap"("logbook_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "Review_logbook_id_location_id_key" ON "public"."Review"("logbook_id", "location_id");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_current_character_id_fkey" FOREIGN KEY ("current_character_id") REFERENCES "public"."Character"("character_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserCharacter" ADD CONSTRAINT "UserCharacter_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."Character"("character_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserCharacter" ADD CONSTRAINT "UserCharacter_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Quest" ADD CONSTRAINT "Quest_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LocationLike" ADD CONSTRAINT "LocationLike_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."Location"("location_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LocationLike" ADD CONSTRAINT "LocationLike_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LocationPhoto" ADD CONSTRAINT "LocationPhoto_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."Location"("location_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Journey" ADD CONSTRAINT "Journey_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."JourneyLocation" ADD CONSTRAINT "JourneyLocation_journey_id_fkey" FOREIGN KEY ("journey_id") REFERENCES "public"."Journey"("journey_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."JourneyLocation" ADD CONSTRAINT "JourneyLocation_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."Location"("location_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LogbookEntry" ADD CONSTRAINT "LogbookEntry_journey_id_fkey" FOREIGN KEY ("journey_id") REFERENCES "public"."Journey"("journey_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LogbookEntry" ADD CONSTRAINT "LogbookEntry_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."Location"("location_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LogbookEntry" ADD CONSTRAINT "LogbookEntry_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Like" ADD CONSTRAINT "Like_logbook_id_fkey" FOREIGN KEY ("logbook_id") REFERENCES "public"."LogbookEntry"("logbook_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Like" ADD CONSTRAINT "Like_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Scrap" ADD CONSTRAINT "Scrap_logbook_id_fkey" FOREIGN KEY ("logbook_id") REFERENCES "public"."LogbookEntry"("logbook_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Scrap" ADD CONSTRAINT "Scrap_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Review" ADD CONSTRAINT "Review_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."Location"("location_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Review" ADD CONSTRAINT "Review_logbook_id_fkey" FOREIGN KEY ("logbook_id") REFERENCES "public"."LogbookEntry"("logbook_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Review" ADD CONSTRAINT "Review_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
