-- Customer reviews (Review) and the per-user popup state (ReviewPrompt).
-- Purely additive and idempotent (IF NOT EXISTS / duplicate_object guards), so it is
-- safe to re-run and safe where the tables were already created by a schema push.

CREATE TABLE IF NOT EXISTS "public"."Review" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "orgId" TEXT,
    "authorName" TEXT NOT NULL,
    "authorRole" TEXT,
    "avatarUrl" TEXT,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'in_app',
    "sourceUrl" TEXT,
    "publicConsent" BOOLEAN NOT NULL DEFAULT false,
    "adminReply" TEXT,
    "adminNote" TEXT,
    "reviewedBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."ReviewPrompt" (
    "userId" TEXT NOT NULL,
    "askCount" INTEGER NOT NULL DEFAULT 0,
    "lastAskedAt" TIMESTAMP(3),
    "snoozeUntil" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewPrompt_pkey" PRIMARY KEY ("userId")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Review_userId_key" ON "public"."Review"("userId");
CREATE INDEX IF NOT EXISTS "Review_status_featured_sortOrder_idx" ON "public"."Review"("status", "featured", "sortOrder");
CREATE INDEX IF NOT EXISTS "Review_createdAt_idx" ON "public"."Review"("createdAt");

DO $$ BEGIN
    ALTER TABLE "public"."Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "public"."ReviewPrompt" ADD CONSTRAINT "ReviewPrompt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
