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

-- CreateIndex
CREATE INDEX "LocationPhoto_location_id_idx" ON "public"."LocationPhoto"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "LocationPhoto_location_id_position_key" ON "public"."LocationPhoto"("location_id", "position");

-- AddForeignKey
ALTER TABLE "public"."LocationPhoto" ADD CONSTRAINT "LocationPhoto_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."Location"("location_id") ON DELETE CASCADE ON UPDATE CASCADE;
