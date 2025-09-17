-- CreateTable
CREATE TABLE "public"."LocationLike" (
    "like_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "location_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationLike_pkey" PRIMARY KEY ("like_id")
);

-- CreateIndex
CREATE INDEX "LocationLike_user_id_idx" ON "public"."LocationLike"("user_id");

-- CreateIndex
CREATE INDEX "LocationLike_location_id_idx" ON "public"."LocationLike"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "LocationLike_user_id_location_id_key" ON "public"."LocationLike"("user_id", "location_id");

-- AddForeignKey
ALTER TABLE "public"."LocationLike" ADD CONSTRAINT "LocationLike_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LocationLike" ADD CONSTRAINT "LocationLike_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."Location"("location_id") ON DELETE CASCADE ON UPDATE CASCADE;
