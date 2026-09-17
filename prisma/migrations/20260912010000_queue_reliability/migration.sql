-- Queue reliability: crash-recovery lease on jobs, resumable-publisher
-- state on channels (X threads resume instead of duplicating on retry).
ALTER TABLE "PublishJob" ADD COLUMN "leaseUntil" TIMESTAMP(3);
ALTER TABLE "PostChannel" ADD COLUMN "retryState" TEXT;
