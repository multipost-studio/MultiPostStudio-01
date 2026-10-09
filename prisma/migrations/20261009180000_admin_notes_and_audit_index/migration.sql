-- Internal notes about customers, and an index so an admin page can look up the audit history of one record.
-- Additive and idempotent. The AuditLog index briefly blocks writes to that table while it builds (a plain
-- CREATE INDEX); the table is append-only and small enough that this is a moment, not a maintenance window.

CREATE TABLE IF NOT EXISTS "public"."AdminNote" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AdminNote_entityType_entityId_createdAt_idx" ON "public"."AdminNote"("entityType", "entityId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_targetType_targetId_idx" ON "public"."AuditLog"("targetType", "targetId");

DO $$ BEGIN
  ALTER TABLE "public"."AdminNote" ADD CONSTRAINT "AdminNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
