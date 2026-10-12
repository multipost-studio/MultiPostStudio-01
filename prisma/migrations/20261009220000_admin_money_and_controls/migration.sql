-- Refund requests (two-person approval), gateway ids on invoices, scoped kill switches, editable email templates and an email log.
-- Additive and idempotent: three nullable columns on Invoice and four new tables. No existing data changes.

ALTER TABLE "public"."Invoice" ADD COLUMN IF NOT EXISTS "provider" TEXT;
ALTER TABLE "public"."Invoice" ADD COLUMN IF NOT EXISTS "providerInvoiceId" TEXT;
ALTER TABLE "public"."Invoice" ADD COLUMN IF NOT EXISTS "providerPaymentId" TEXT;

CREATE TABLE IF NOT EXISTS "public"."RefundRequest" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "provider" TEXT,
    "providerRefundId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."KillSwitch" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeValue" TEXT,
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KillSwitch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."EmailTemplateVersion" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailTemplateVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."EmailLog" (
    "id" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerId" TEXT,
    "error" TEXT,
    "opened" BOOLEAN NOT NULL DEFAULT false,
    "clicked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RefundRequest_invoiceId_idx" ON "public"."RefundRequest"("invoiceId");

CREATE INDEX IF NOT EXISTS "RefundRequest_status_createdAt_idx" ON "public"."RefundRequest"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "RefundRequest_orgId_createdAt_idx" ON "public"."RefundRequest"("orgId", "createdAt");

CREATE INDEX IF NOT EXISTS "KillSwitch_kind_revokedAt_idx" ON "public"."KillSwitch"("kind", "revokedAt");

CREATE INDEX IF NOT EXISTS "EmailTemplateVersion_key_isActive_idx" ON "public"."EmailTemplateVersion"("key", "isActive");

CREATE UNIQUE INDEX IF NOT EXISTS "EmailTemplateVersion_key_version_key" ON "public"."EmailTemplateVersion"("key", "version");

CREATE INDEX IF NOT EXISTS "EmailLog_template_createdAt_idx" ON "public"."EmailLog"("template", "createdAt");

CREATE INDEX IF NOT EXISTS "EmailLog_createdAt_idx" ON "public"."EmailLog"("createdAt");

CREATE INDEX IF NOT EXISTS "EmailLog_providerId_idx" ON "public"."EmailLog"("providerId");
