-- Admin governance: configuration revisions, AI call log, incident follow-up, backup evidence and policy versions.
-- Additive and idempotent: five new tables and their indexes, no change to existing data, no foreign keys.

CREATE TABLE IF NOT EXISTS "public"."ConfigRevision" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "before" TEXT,
    "after" TEXT NOT NULL,
    "actorId" TEXT,
    "reason" TEXT,
    "restoredFromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfigRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."AiCallLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "reason" TEXT,
    "latencyMs" INTEGER NOT NULL,
    "inputChars" INTEGER NOT NULL,
    "outputChars" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCallLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."IncidentRecord" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "ownerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "postmortem" TEXT,
    "postmortemAt" TIMESTAMP(3),
    "postmortemById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncidentRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."BackupCheck" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackupCheck_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."PolicyVersion" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "summary" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "publishedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ConfigRevision_key_createdAt_idx" ON "public"."ConfigRevision"("key", "createdAt");

CREATE INDEX IF NOT EXISTS "AiCallLog_createdAt_idx" ON "public"."AiCallLog"("createdAt");

CREATE INDEX IF NOT EXISTS "AiCallLog_provider_createdAt_idx" ON "public"."AiCallLog"("provider", "createdAt");

CREATE INDEX IF NOT EXISTS "AiCallLog_workspaceId_createdAt_idx" ON "public"."AiCallLog"("workspaceId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "IncidentRecord_key_key" ON "public"."IncidentRecord"("key");

CREATE INDEX IF NOT EXISTS "IncidentRecord_status_idx" ON "public"."IncidentRecord"("status");

CREATE INDEX IF NOT EXISTS "BackupCheck_kind_occurredAt_idx" ON "public"."BackupCheck"("kind", "occurredAt");

CREATE INDEX IF NOT EXISTS "PolicyVersion_type_effectiveAt_idx" ON "public"."PolicyVersion"("type", "effectiveAt");

CREATE UNIQUE INDEX IF NOT EXISTS "PolicyVersion_type_version_key" ON "public"."PolicyVersion"("type", "version");
