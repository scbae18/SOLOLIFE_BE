-- CreateTable
CREATE TABLE "public"."User" (
    "user_id" SERIAL NOT NULL,
    "username" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "explorer_level" INTEGER NOT NULL DEFAULT 1,
    "experience_points" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_public_profile" BOOLEAN NOT NULL DEFAULT true,
    "current_character_id" INTEGER,

    CONSTRAINT "User_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "public"."Character" (
    "character_id" SERIAL NOT NULL,
    "character_name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "image_url" VARCHAR(255),
    "unlock_level" INTEGER NOT NULL,
    "is_premium" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("character_id")
);

-- CreateTable
CREATE TABLE "public"."UserCharacter" (
    "user_character_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "character_id" INTEGER NOT NULL,
    "unlocked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCharacter_pkey" PRIMARY KEY ("user_character_id")
);

-- CreateTable
CREATE TABLE "public"."Quest" (
    "quest_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "quest_title" TEXT NOT NULL,
    "quest_description" TEXT,
    "required_level" INTEGER NOT NULL,
    "reward_exp" INTEGER NOT NULL,
    "is_main_quest" BOOLEAN NOT NULL DEFAULT false,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Quest_pkey" PRIMARY KEY ("quest_id")
);

-- CreateTable
CREATE TABLE "public"."Location" (
    "location_id" SERIAL NOT NULL,
    "location_name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DECIMAL(65,30) NOT NULL,
    "longitude" DECIMAL(65,30) NOT NULL,
    "category" TEXT,
    "is_solo_friendly" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("location_id")
);

-- CreateTable
CREATE TABLE "public"."Journey" (
    "journey_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "journey_title" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

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

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "public"."User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserCharacter_user_id_character_id_key" ON "public"."UserCharacter"("user_id", "character_id");

-- CreateIndex
CREATE UNIQUE INDEX "Like_logbook_id_user_id_key" ON "public"."Like"("logbook_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "Scrap_logbook_id_user_id_key" ON "public"."Scrap"("logbook_id", "user_id");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_current_character_id_fkey" FOREIGN KEY ("current_character_id") REFERENCES "public"."Character"("character_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserCharacter" ADD CONSTRAINT "UserCharacter_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserCharacter" ADD CONSTRAINT "UserCharacter_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."Character"("character_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Quest" ADD CONSTRAINT "Quest_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Journey" ADD CONSTRAINT "Journey_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."JourneyLocation" ADD CONSTRAINT "JourneyLocation_journey_id_fkey" FOREIGN KEY ("journey_id") REFERENCES "public"."Journey"("journey_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."JourneyLocation" ADD CONSTRAINT "JourneyLocation_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."Location"("location_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LogbookEntry" ADD CONSTRAINT "LogbookEntry_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LogbookEntry" ADD CONSTRAINT "LogbookEntry_journey_id_fkey" FOREIGN KEY ("journey_id") REFERENCES "public"."Journey"("journey_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LogbookEntry" ADD CONSTRAINT "LogbookEntry_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."Location"("location_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Like" ADD CONSTRAINT "Like_logbook_id_fkey" FOREIGN KEY ("logbook_id") REFERENCES "public"."LogbookEntry"("logbook_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Like" ADD CONSTRAINT "Like_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Scrap" ADD CONSTRAINT "Scrap_logbook_id_fkey" FOREIGN KEY ("logbook_id") REFERENCES "public"."LogbookEntry"("logbook_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Scrap" ADD CONSTRAINT "Scrap_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
