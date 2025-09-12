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
CREATE UNIQUE INDEX "Review_logbook_id_key" ON "public"."Review"("logbook_id");

-- AddForeignKey
ALTER TABLE "public"."Review" ADD CONSTRAINT "Review_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Review" ADD CONSTRAINT "Review_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."Location"("location_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Review" ADD CONSTRAINT "Review_logbook_id_fkey" FOREIGN KEY ("logbook_id") REFERENCES "public"."LogbookEntry"("logbook_id") ON DELETE CASCADE ON UPDATE CASCADE;
