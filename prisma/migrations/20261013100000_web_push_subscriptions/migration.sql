-- Web Push: one row per browser or installed-app endpoint that may receive notifications for a user. Additive and idempotent.

CREATE TABLE IF NOT EXISTS "public"."PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "label" TEXT NOT NULL,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSuccessAt" TIMESTAMP(3),

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "public"."PushSubscription"("endpoint");
CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "public"."PushSubscription"("userId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PushSubscription_userId_fkey') THEN
    ALTER TABLE "public"."PushSubscription"
      ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- Same defence in depth as 20261012100000_rls_lockdown, for the table this migration adds: on a Supabase database, no API
-- access to it (it holds device endpoints and encryption keys). Skipped wherever the Supabase roles do not exist or the
-- migrating role does not bypass RLS.
DO $$
BEGIN
  IF (to_regrole('anon') IS NOT NULL OR to_regrole('authenticated') IS NOT NULL)
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolbypassrls OR rolsuper)) THEN
    BEGIN
      ALTER TABLE "public"."PushSubscription" ENABLE ROW LEVEL SECURITY;
      IF to_regrole('anon') IS NOT NULL THEN
        REVOKE ALL ON TABLE "public"."PushSubscription" FROM anon;
      END IF;
      IF to_regrole('authenticated') IS NOT NULL THEN
        REVOKE ALL ON TABLE "public"."PushSubscription" FROM authenticated;
      END IF;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'PushSubscription: not the owner, RLS left as is';
    END;
  END IF;
END
$$;
