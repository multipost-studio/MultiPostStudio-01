-- Evergreen recycling: a repost points at the post it was recycled from.
-- Repost count and last-recycled time are derived from these rows, so the
-- recycler needs no counter columns that could drift from reality.
ALTER TABLE "Post" ADD COLUMN "recycledFromId" TEXT;

CREATE INDEX "Post_recycledFromId_idx" ON "Post"("recycledFromId");

-- SET NULL, not CASCADE: deleting the original must not delete posts that
-- already went out to real accounts.
ALTER TABLE "Post" ADD CONSTRAINT "Post_recycledFromId_fkey"
  FOREIGN KEY ("recycledFromId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
