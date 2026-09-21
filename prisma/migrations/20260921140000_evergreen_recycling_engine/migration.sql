-- AlterTable: Add evergreen recycling engine fields to Post and RecycleRule
ALTER TABLE "public"."Post"
  ADD COLUMN IF NOT EXISTS "recycleVariations" TEXT,
  ADD COLUMN IF NOT EXISTS "recyclePaused" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "recycleExhausted" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "public"."RecycleRule"
  ADD COLUMN IF NOT EXISTS "pillarId" TEXT,
  ADD COLUMN IF NOT EXISTS "minEngagementRate" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "decayFactor" DOUBLE PRECISION DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS "rotateVariations" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "autoHashtagVariation" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecycleRule_workspaceId_idx" ON "public"."RecycleRule"("workspaceId");
CREATE INDEX IF NOT EXISTS "RecycleRule_pillarId_idx" ON "public"."RecycleRule"("pillarId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RecycleRule_pillarId_fkey'
  ) THEN
    ALTER TABLE "public"."RecycleRule"
      ADD CONSTRAINT "RecycleRule_pillarId_fkey"
      FOREIGN KEY ("pillarId") REFERENCES "public"."ContentPillar"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
