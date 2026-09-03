-- AlterTable
ALTER TABLE "public"."Subscription" ADD COLUMN "couponCode" TEXT,
ADD COLUMN "discountPct" INTEGER NOT NULL DEFAULT 0;
