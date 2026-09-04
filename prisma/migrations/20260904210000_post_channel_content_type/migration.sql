-- Per-channel publishing format (Instagram reel vs feed, YouTube short vs video, ...).
-- Rules live in src/lib/social/capabilities.ts.
ALTER TABLE "PostChannel" ADD COLUMN "contentType" TEXT NOT NULL DEFAULT 'post';
