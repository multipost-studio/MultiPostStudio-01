-- Append-only history for the admin Health Probes (uptime, latency, incidents).
-- Purely additive: no existing table or column is touched.
-- Idempotent (IF NOT EXISTS) so it is safe whether or not the table was already created by a schema push.

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."HealthProbeRun" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "probeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "message" TEXT NOT NULL,
    "details" TEXT,
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthProbeRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HealthProbeRun_probeId_createdAt_idx" ON "public"."HealthProbeRun"("probeId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HealthProbeRun_createdAt_idx" ON "public"."HealthProbeRun"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HealthProbeRun_runId_idx" ON "public"."HealthProbeRun"("runId");
