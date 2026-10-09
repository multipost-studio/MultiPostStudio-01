-- Multi-tenant lookups filter by workspaceId on these tables, and a workspace delete cascades through them;
-- without an index each of those is a full scan. Additive and idempotent.

CREATE INDEX IF NOT EXISTS "QueueSlot_workspaceId_idx" ON "public"."QueueSlot"("workspaceId");
CREATE INDEX IF NOT EXISTS "MediaFolder_workspaceId_idx" ON "public"."MediaFolder"("workspaceId");
CREATE INDEX IF NOT EXISTS "Template_workspaceId_idx" ON "public"."Template"("workspaceId");
CREATE INDEX IF NOT EXISTS "ApprovalFlow_workspaceId_idx" ON "public"."ApprovalFlow"("workspaceId");
CREATE INDEX IF NOT EXISTS "SavedReply_workspaceId_idx" ON "public"."SavedReply"("workspaceId");
CREATE INDEX IF NOT EXISTS "Trend_workspaceId_idx" ON "public"."Trend"("workspaceId");
CREATE INDEX IF NOT EXISTS "Competitor_workspaceId_idx" ON "public"."Competitor"("workspaceId");
CREATE INDEX IF NOT EXISTS "Opportunity_workspaceId_idx" ON "public"."Opportunity"("workspaceId");
CREATE INDEX IF NOT EXISTS "Automation_workspaceId_idx" ON "public"."Automation"("workspaceId");
CREATE INDEX IF NOT EXISTS "Report_workspaceId_idx" ON "public"."Report"("workspaceId");
CREATE INDEX IF NOT EXISTS "ContentGoal_workspaceId_idx" ON "public"."ContentGoal"("workspaceId");
