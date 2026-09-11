-- Free/Pro/Team plans have always advertised a workspace count in their
-- marketing bullets ("1 workspace", "3 workspaces", "10 workspaces") that was
-- never actually enforced anywhere in the code — createWorkspaceAction had no
-- limit check because there was no limit to check. This adds one.
--
-- Values below match the marketing copy in src/lib/constants.ts PLAN_CATALOG
-- exactly, backfilled onto existing rows so the column isn't silently 0
-- (unlimited) for every plan the moment it's added.
ALTER TABLE "Plan" ADD COLUMN "maxWorkspaces" INTEGER NOT NULL DEFAULT 0;

UPDATE "Plan" SET "maxWorkspaces" = 1 WHERE "key" = 'free';
UPDATE "Plan" SET "maxWorkspaces" = 3 WHERE "key" = 'pro';
UPDATE "Plan" SET "maxWorkspaces" = 10 WHERE "key" = 'team';
-- agency and enterprise stay 0 (unlimited) — matches "Unlimited workspaces" /
-- "Custom channels + seats" in their marketing bullets.
