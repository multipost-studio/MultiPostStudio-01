-- Notification Center: richer Notification rows and per-user notification settings.
-- Purely additive and idempotent (IF NOT EXISTS), and every new column has a default or is nullable, so
-- existing rows and every existing writer (admin broadcasts, older code paths) keep working untouched.

ALTER TABLE "public"."Notification" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "public"."Notification" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'system';
ALTER TABLE "public"."Notification" ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE "public"."Notification" ADD COLUMN IF NOT EXISTS "actionLabel" TEXT;
ALTER TABLE "public"."Notification" ADD COLUMN IF NOT EXISTS "entityType" TEXT;
ALTER TABLE "public"."Notification" ADD COLUMN IF NOT EXISTS "entityId" TEXT;
ALTER TABLE "public"."Notification" ADD COLUMN IF NOT EXISTS "platform" TEXT;
ALTER TABLE "public"."Notification" ADD COLUMN IF NOT EXISTS "metadata" TEXT;
ALTER TABLE "public"."Notification" ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT;
ALTER TABLE "public"."Notification" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "public"."Notification" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "public"."NotificationPref" ADD COLUMN IF NOT EXISTS "settings" TEXT;

-- Give the notifications that already exist the category and priority their type implies, so they
-- file under the right tab. Only rows still on the defaults are touched, so re-running changes nothing.
UPDATE "public"."Notification" SET "category" = 'publishing' WHERE "category" = 'system' AND "type" IN ('publish_success', 'publish_failed');
UPDATE "public"."Notification" SET "category" = 'team' WHERE "category" = 'system' AND "type" LIKE 'approval%';
UPDATE "public"."Notification" SET "category" = 'mentions' WHERE "category" = 'system' AND "type" = 'mention';
UPDATE "public"."Notification" SET "category" = 'engagement' WHERE "category" = 'system' AND "type" IN ('engagement_alert', 'streak_milestone', 'insight');
UPDATE "public"."Notification" SET "priority" = 'high' WHERE "priority" = 'normal' AND "type" = 'publish_failed';

CREATE UNIQUE INDEX IF NOT EXISTS "Notification_userId_dedupeKey_key" ON "public"."Notification"("userId", "dedupeKey");
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "public"."Notification"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Notification_userId_category_createdAt_idx" ON "public"."Notification"("userId", "category", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Notification_expiresAt_idx" ON "public"."Notification"("expiresAt");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "public"."Notification"("createdAt");
