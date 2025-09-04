-- AlterTable
ALTER TABLE "public"."Location" ADD COLUMN     "features_flat" TEXT[] DEFAULT ARRAY[]::TEXT[];
