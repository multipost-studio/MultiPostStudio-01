-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "referralCode" TEXT;

-- CreateTable
CREATE TABLE "public"."CmsEntry" (
    "id" TEXT NOT NULL,
    "collection" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "sortIndex" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "CmsEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Referral" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "refereeId" TEXT,
    "refereeEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'signed_up',
    "convertedAt" TIMESTAMP(3),
    "rewardedReferrer" BOOLEAN NOT NULL DEFAULT false,
    "rewardedReferee" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReferralReward" (
    "id" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "aiCredits" INTEGER NOT NULL DEFAULT 0,
    "side" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CmsEntry_collection_published_sortIndex_idx" ON "public"."CmsEntry"("collection", "published", "sortIndex");

-- CreateIndex
CREATE UNIQUE INDEX "CmsEntry_collection_slug_key" ON "public"."CmsEntry"("collection", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_refereeId_key" ON "public"."Referral"("refereeId");

-- CreateIndex
CREATE INDEX "Referral_referrerId_idx" ON "public"."Referral"("referrerId");

-- CreateIndex
CREATE INDEX "ReferralReward_orgId_idx" ON "public"."ReferralReward"("orgId");

-- CreateIndex
CREATE INDEX "ReferralReward_userId_idx" ON "public"."ReferralReward"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "public"."User"("referralCode");

-- AddForeignKey
ALTER TABLE "public"."Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Referral" ADD CONSTRAINT "Referral_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReferralReward" ADD CONSTRAINT "ReferralReward_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "public"."Referral"("id") ON DELETE CASCADE ON UPDATE CASCADE;

