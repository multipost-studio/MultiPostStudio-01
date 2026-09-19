-- Performance indexes for foreign key filtering and high-frequency queue lookups.
-- Speeds up /campaigns/[id], content pillars, social channel cascades, and worker job queries.

CREATE INDEX IF NOT EXISTS "ContentIdea_campaignId_idx" ON "ContentIdea"("campaignId");
CREATE INDEX IF NOT EXISTS "ContentIdea_pillarId_idx" ON "ContentIdea"("pillarId");
CREATE INDEX IF NOT EXISTS "Post_campaignId_idx" ON "Post"("campaignId");
CREATE INDEX IF NOT EXISTS "Post_pillarId_idx" ON "Post"("pillarId");
CREATE INDEX IF NOT EXISTS "PostChannel_channelId_idx" ON "PostChannel"("channelId");
CREATE INDEX IF NOT EXISTS "PublishJob_postId_status_idx" ON "PublishJob"("postId", "status");
