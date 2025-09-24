-- CreateTable
CREATE TABLE "public"."Asset" (
    "asset_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "image_url" TEXT,
    "rarity" TEXT,
    "price_points" INTEGER,
    "is_gacha_only" BOOLEAN NOT NULL DEFAULT false,
    "anchor" TEXT,
    "z_index" INTEGER,
    "scale" DOUBLE PRECISION,
    "meta" JSONB,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("asset_id")
);
