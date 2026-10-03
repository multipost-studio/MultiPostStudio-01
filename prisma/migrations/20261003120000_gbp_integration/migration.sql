-- AlterTable
ALTER TABLE "public"."SocialChannel" ADD COLUMN "metadata" TEXT;

-- AlterTable
ALTER TABLE "public"."PostChannel" ADD COLUMN "metadata" TEXT;

-- CreateTable
CREATE TABLE "public"."GbpAnalyticsCache" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL DEFAULT '',
    "cacheKey" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GbpAnalyticsCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GbpAnalyticsCache_socialAccountId_idx" ON "public"."GbpAnalyticsCache"("socialAccountId");

-- CreateIndex
CREATE INDEX "GbpAnalyticsCache_socialAccountId_locationId_idx" ON "public"."GbpAnalyticsCache"("socialAccountId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "GbpAnalyticsCache_socialAccountId_locationId_cacheKey_key" ON "public"."GbpAnalyticsCache"("socialAccountId", "locationId", "cacheKey");

-- AddForeignKey
ALTER TABLE "public"."GbpAnalyticsCache" ADD CONSTRAINT "GbpAnalyticsCache_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "public"."SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
