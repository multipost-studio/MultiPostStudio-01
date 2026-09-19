-- Publish-job open uniqueness: at most one queued|running job per post.
-- enqueuePublish used to check-then-create, so two concurrent
-- schedule/publish calls (double-click Publish, timeout retry, overlapping
-- ticks) could both create an open job for the same post. Both jobs would
-- pass the atomic claim (different rows) and post the same channels twice
-- to the real audience. The partial index makes the second create fail at
-- the database level; the application catches P2002 and updates the
-- existing open job's runAt instead. Terminal states (done/failed/canceled)
-- are unaffected, so history and retries keep working.
CREATE UNIQUE INDEX "PublishJob_postId_open_unique" ON "PublishJob"("postId") WHERE "status" IN ('queued', 'running');
