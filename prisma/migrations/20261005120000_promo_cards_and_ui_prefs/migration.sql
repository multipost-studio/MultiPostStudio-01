-- CreateTable
CREATE TABLE "public"."UserPreference" (
    "userId" TEXT NOT NULL,
    "dashboard" TEXT,
    "sidebar" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "public"."PromoCard" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ctaText" TEXT NOT NULL,
    "ctaUrl" TEXT NOT NULL,
    "icon" TEXT,
    "imageUrl" TEXT,
    "tone" TEXT NOT NULL DEFAULT 'brand',
    "placement" TEXT NOT NULL DEFAULT 'sidebar',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "dismissible" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "targetPlans" TEXT NOT NULL DEFAULT '[]',
    "targetAudience" TEXT NOT NULL DEFAULT '{}',
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PromoCardEngagement" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCardEngagement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PromoCard_placement_enabled_archivedAt_idx" ON "public"."PromoCard"("placement", "enabled", "archivedAt");

-- CreateIndex
CREATE INDEX "PromoCardEngagement_userId_idx" ON "public"."PromoCardEngagement"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCardEngagement_cardId_userId_key" ON "public"."PromoCardEngagement"("cardId", "userId");

-- AddForeignKey
ALTER TABLE "public"."UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PromoCardEngagement" ADD CONSTRAINT "PromoCardEngagement_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "public"."PromoCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PromoCardEngagement" ADD CONSTRAINT "PromoCardEngagement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
