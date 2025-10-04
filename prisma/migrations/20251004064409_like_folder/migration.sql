-- CreateTable
CREATE TABLE "public"."LikeFolder" (
    "folder_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LikeFolder_pkey" PRIMARY KEY ("folder_id")
);

-- CreateTable
CREATE TABLE "public"."LikeItem" (
    "like_item_id" SERIAL NOT NULL,
    "folder_id" INTEGER NOT NULL,
    "location_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LikeItem_pkey" PRIMARY KEY ("like_item_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LikeFolder_user_id_name_key" ON "public"."LikeFolder"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "LikeItem_folder_id_location_id_key" ON "public"."LikeItem"("folder_id", "location_id");

-- AddForeignKey
ALTER TABLE "public"."LikeFolder" ADD CONSTRAINT "LikeFolder_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LikeItem" ADD CONSTRAINT "LikeItem_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."LikeFolder"("folder_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LikeItem" ADD CONSTRAINT "LikeItem_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."Location"("location_id") ON DELETE CASCADE ON UPDATE CASCADE;
