-- CreateTable
CREATE TABLE "public"."AcquisitionVisit" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" TEXT NOT NULL,
    "source" TEXT,
    "medium" TEXT,
    "campaign" TEXT,
    "term" TEXT,
    "content" TEXT,
    "referrerHost" TEXT,
    "landingPath" TEXT NOT NULL,
    "clickId" TEXT,

    CONSTRAINT "AcquisitionVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserAttribution" (
    "userId" TEXT NOT NULL,
    "visitorId" TEXT,
    "channel" TEXT NOT NULL,
    "source" TEXT,
    "medium" TEXT,
    "campaign" TEXT,
    "term" TEXT,
    "content" TEXT,
    "referrerHost" TEXT,
    "landingPath" TEXT,
    "lastChannel" TEXT,
    "lastSource" TEXT,
    "lastMedium" TEXT,
    "lastCampaign" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAttribution_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "public"."MarketingSegment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filter" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingSegment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcquisitionVisit_createdAt_idx" ON "public"."AcquisitionVisit"("createdAt");
CREATE INDEX "AcquisitionVisit_channel_createdAt_idx" ON "public"."AcquisitionVisit"("channel", "createdAt");
CREATE INDEX "AcquisitionVisit_source_createdAt_idx" ON "public"."AcquisitionVisit"("source", "createdAt");
CREATE INDEX "AcquisitionVisit_campaign_createdAt_idx" ON "public"."AcquisitionVisit"("campaign", "createdAt");
CREATE INDEX "AcquisitionVisit_visitorId_idx" ON "public"."AcquisitionVisit"("visitorId");
CREATE INDEX "UserAttribution_channel_idx" ON "public"."UserAttribution"("channel");
CREATE INDEX "UserAttribution_source_idx" ON "public"."UserAttribution"("source");
CREATE INDEX "UserAttribution_campaign_idx" ON "public"."UserAttribution"("campaign");
CREATE INDEX "UserAttribution_createdAt_idx" ON "public"."UserAttribution"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."UserAttribution" ADD CONSTRAINT "UserAttribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
