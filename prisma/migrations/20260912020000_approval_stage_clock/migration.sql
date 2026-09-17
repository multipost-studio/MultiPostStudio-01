-- Approval SLA clock: explicit stage-entry timestamp (updatedAt moved on any
-- row touch, silently resetting the timer). Backfilled from updatedAt so
-- existing open requests keep a sensible clock.
ALTER TABLE "ApprovalRequest" ADD COLUMN "stageEnteredAt" TIMESTAMP(3);
UPDATE "ApprovalRequest" SET "stageEnteredAt" = "updatedAt" WHERE "stageEnteredAt" IS NULL;
