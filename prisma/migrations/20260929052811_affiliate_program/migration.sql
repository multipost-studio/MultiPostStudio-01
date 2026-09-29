-- CreateTable
CREATE TABLE "public"."Affiliate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "affiliateCode" TEXT NOT NULL,
    "applicationStatus" TEXT NOT NULL DEFAULT 'pending_review',
    "status" TEXT NOT NULL DEFAULT 'active',
    "commissionType" TEXT NOT NULL DEFAULT 'percent_recurring',
    "commissionRate" INTEGER NOT NULL DEFAULT 20,
    "commissionFixedAmount" INTEGER NOT NULL DEFAULT 0,
    "recurringMonths" INTEGER NOT NULL DEFAULT 12,
    "cookieDurationDays" INTEGER NOT NULL DEFAULT 30,
    "payoutThresholdMinor" INTEGER NOT NULL DEFAULT 5000,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "country" TEXT,
    "payoutMethod" TEXT,
    "payoutAccountRef" TEXT,
    "taxStatus" TEXT NOT NULL DEFAULT 'not_provided',
    "termsVersion" TEXT,
    "termsAcceptedAt" TIMESTAMP(3),
    "disclosureAcknowledgedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "terminatedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Affiliate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AffiliateLink" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "campaignName" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AffiliateClick" (
    "id" TEXT NOT NULL,
    "affiliateLinkId" TEXT NOT NULL,
    "visitorHash" TEXT NOT NULL,
    "landingPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AffiliateConversion" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "affiliateLinkId" TEXT,
    "attributedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "qualifiedAt" TIMESTAMP(3),

    CONSTRAINT "AffiliateConversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AffiliateCommission" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "conversionId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "payoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AffiliatePayout" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" TEXT NOT NULL DEFAULT 'requested',
    "method" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "adminNote" TEXT,

    CONSTRAINT "AffiliatePayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AffiliateAdjustment" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AffiliateFraudEvent" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'low',
    "evidence" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,

    CONSTRAINT "AffiliateFraudEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Affiliate_userId_key" ON "public"."Affiliate"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Affiliate_affiliateCode_key" ON "public"."Affiliate"("affiliateCode");

-- CreateIndex
CREATE INDEX "Affiliate_status_idx" ON "public"."Affiliate"("status");

-- CreateIndex
CREATE INDEX "Affiliate_applicationStatus_idx" ON "public"."Affiliate"("applicationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateLink_code_key" ON "public"."AffiliateLink"("code");

-- CreateIndex
CREATE INDEX "AffiliateLink_affiliateId_idx" ON "public"."AffiliateLink"("affiliateId");

-- CreateIndex
CREATE INDEX "AffiliateClick_affiliateLinkId_idx" ON "public"."AffiliateClick"("affiliateLinkId");

-- CreateIndex
CREATE INDEX "AffiliateClick_visitorHash_idx" ON "public"."AffiliateClick"("visitorHash");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateConversion_orgId_key" ON "public"."AffiliateConversion"("orgId");

-- CreateIndex
CREATE INDEX "AffiliateConversion_affiliateId_idx" ON "public"."AffiliateConversion"("affiliateId");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateCommission_invoiceId_key" ON "public"."AffiliateCommission"("invoiceId");

-- CreateIndex
CREATE INDEX "AffiliateCommission_affiliateId_idx" ON "public"."AffiliateCommission"("affiliateId");

-- CreateIndex
CREATE INDEX "AffiliateCommission_status_idx" ON "public"."AffiliateCommission"("status");

-- CreateIndex
CREATE INDEX "AffiliatePayout_affiliateId_idx" ON "public"."AffiliatePayout"("affiliateId");

-- CreateIndex
CREATE INDEX "AffiliateAdjustment_affiliateId_idx" ON "public"."AffiliateAdjustment"("affiliateId");

-- CreateIndex
CREATE INDEX "AffiliateFraudEvent_affiliateId_idx" ON "public"."AffiliateFraudEvent"("affiliateId");

-- CreateIndex
CREATE INDEX "AffiliateFraudEvent_status_idx" ON "public"."AffiliateFraudEvent"("status");

-- AddForeignKey
ALTER TABLE "public"."Affiliate" ADD CONSTRAINT "Affiliate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AffiliateLink" ADD CONSTRAINT "AffiliateLink_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "public"."Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AffiliateClick" ADD CONSTRAINT "AffiliateClick_affiliateLinkId_fkey" FOREIGN KEY ("affiliateLinkId") REFERENCES "public"."AffiliateLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AffiliateConversion" ADD CONSTRAINT "AffiliateConversion_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "public"."Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "public"."Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_conversionId_fkey" FOREIGN KEY ("conversionId") REFERENCES "public"."AffiliateConversion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "public"."AffiliatePayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AffiliatePayout" ADD CONSTRAINT "AffiliatePayout_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "public"."Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AffiliateAdjustment" ADD CONSTRAINT "AffiliateAdjustment_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "public"."Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AffiliateFraudEvent" ADD CONSTRAINT "AffiliateFraudEvent_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "public"."Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
