-- Admin access control: custom roles and role assignments for platform staff.
-- Additive and idempotent. Existing administrators are untouched (a staff member with no platformRole keeps full
-- access); nothing is seeded, because the built-in roles are defined in code.

CREATE TABLE IF NOT EXISTS "public"."AdminCustomRole" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminCustomRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."AdminRoleAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleKey" TEXT NOT NULL,
    "grantedById" TEXT,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminRoleAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdminCustomRole_key_key" ON "public"."AdminCustomRole"("key");
CREATE INDEX IF NOT EXISTS "AdminRoleAssignment_userId_revokedAt_idx" ON "public"."AdminRoleAssignment"("userId", "revokedAt");
CREATE INDEX IF NOT EXISTS "AdminRoleAssignment_roleKey_idx" ON "public"."AdminRoleAssignment"("roleKey");

DO $$ BEGIN
  ALTER TABLE "public"."AdminRoleAssignment" ADD CONSTRAINT "AdminRoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
