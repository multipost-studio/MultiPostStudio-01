-- AlterTable: Add Campaign Hub fields
ALTER TABLE "public"."Campaign"
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "targetAudience" TEXT,
  ADD COLUMN IF NOT EXISTS "kpiTarget" INTEGER,
  ADD COLUMN IF NOT EXISTS "kpiMetric" TEXT,
  ADD COLUMN IF NOT EXISTS "tags" TEXT;
