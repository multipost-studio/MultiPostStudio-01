-- CreateTable
CREATE TABLE "public"."YoutubeAnalyticsCache" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "YoutubeAnalyticsCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "YoutubeAnalyticsCache_socialAccountId_idx" ON "public"."YoutubeAnalyticsCache"("socialAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "YoutubeAnalyticsCache_socialAccountId_cacheKey_key" ON "public"."YoutubeAnalyticsCache"("socialAccountId", "cacheKey");

-- AddForeignKey
ALTER TABLE "public"."YoutubeAnalyticsCache" ADD CONSTRAINT "YoutubeAnalyticsCache_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "public"."SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
