-- A workspace's shared reference time zone. Nullable and without a default: existing workspaces stay "not set",
-- and nothing about scheduling or publishing changes. Additive and idempotent.
ALTER TABLE "public"."Workspace" ADD COLUMN IF NOT EXISTS "timezone" TEXT;
