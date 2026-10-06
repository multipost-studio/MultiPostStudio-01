-- Admin-editable platform rules (overrides over code defaults) + append-only change history.
-- Purely additive: no existing table or column is touched.
-- Idempotent (IF NOT EXISTS) so it is safe whether or not the tables were already created by a schema push.

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."PlatformRule" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "value" INTEGER,
    "enabled" BOOLEAN,
    "kind" TEXT,
    "sourceName" TEXT,
    "sourceUrl" TEXT,
    "version" TEXT,
    "verification" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."PlatformRuleRevision" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "changedBy" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "oldValue" TEXT NOT NULL,
    "newValue" TEXT NOT NULL,
    "version" TEXT,
    "sourceName" TEXT,
    "sourceUrl" TEXT,

    CONSTRAINT "PlatformRuleRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlatformRule_platform_idx" ON "public"."PlatformRule"("platform");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlatformRuleRevision_ruleId_changedAt_idx" ON "public"."PlatformRuleRevision"("ruleId", "changedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlatformRuleRevision_changedAt_idx" ON "public"."PlatformRuleRevision"("changedAt");
