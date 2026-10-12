-- Additive and idempotent. Every new column defaults to today's behaviour, so nothing changes until someone opts in.
--   Workspace.restricted       false = every org member can open the workspace (as before)
--   Workspace.requireApproval  false = approvals stay optional (as before)
--   ImpersonationSession       server-side record of a support session, so it can be ended

ALTER TABLE "public"."Workspace" ADD COLUMN IF NOT EXISTS "requireApproval" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "public"."Workspace" ADD COLUMN IF NOT EXISTS "restricted" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "public"."ImpersonationSession" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'view',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,

    CONSTRAINT "ImpersonationSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ImpersonationSession_adminId_idx" ON "public"."ImpersonationSession"("adminId");
CREATE INDEX IF NOT EXISTS "ImpersonationSession_targetUserId_idx" ON "public"."ImpersonationSession"("targetUserId");

-- Same defence in depth as 20261012100000_rls_lockdown, for the table this migration adds: on a Supabase database,
-- no API access to it. Skipped wherever the Supabase roles do not exist or the migrating role does not bypass RLS.
DO $$
BEGIN
  IF (to_regrole('anon') IS NOT NULL OR to_regrole('authenticated') IS NOT NULL)
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolbypassrls OR rolsuper)) THEN
    BEGIN
      ALTER TABLE "public"."ImpersonationSession" ENABLE ROW LEVEL SECURITY;
      IF to_regrole('anon') IS NOT NULL THEN
        REVOKE ALL ON TABLE "public"."ImpersonationSession" FROM anon;
      END IF;
      IF to_regrole('authenticated') IS NOT NULL THEN
        REVOKE ALL ON TABLE "public"."ImpersonationSession" FROM authenticated;
      END IF;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'ImpersonationSession: not the owner, RLS left as is';
    END;
  END IF;
END
$$;
