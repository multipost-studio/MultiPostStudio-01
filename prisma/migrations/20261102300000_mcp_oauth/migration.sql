-- AI-assistant (MCP) access: OAuth 2.1 with PKCE, so Claude, ChatGPT and other MCP clients can connect with a consent screen instead of a pasted
-- API key. Three new tables and nothing else: no existing table, column or row is changed. Only SHA-256 hashes of authorization codes and
-- tokens are stored. Idempotent, so a re-run is harmless.

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."OAuthClient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "redirectUris" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."OAuthAuthRequest" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "state" TEXT,
    "scopes" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,
    "orgId" TEXT,
    "workspaceId" TEXT,
    "grantedScopes" TEXT,
    "codeHash" TEXT,
    "codeExpiresAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthAuthRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."OAuthToken" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "scopes" TEXT NOT NULL,
    "accessHash" TEXT NOT NULL,
    "refreshHash" TEXT NOT NULL,
    "prevRefreshHash" TEXT,
    "accessExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshExpiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OAuthAuthRequest_codeHash_key" ON "public"."OAuthAuthRequest"("codeHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OAuthAuthRequest_expiresAt_idx" ON "public"."OAuthAuthRequest"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OAuthToken_accessHash_key" ON "public"."OAuthToken"("accessHash");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OAuthToken_refreshHash_key" ON "public"."OAuthToken"("refreshHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OAuthToken_orgId_idx" ON "public"."OAuthToken"("orgId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OAuthToken_userId_idx" ON "public"."OAuthToken"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OAuthToken_prevRefreshHash_idx" ON "public"."OAuthToken"("prevRefreshHash");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "public"."OAuthAuthRequest" ADD CONSTRAINT "OAuthAuthRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."OAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "public"."OAuthToken" ADD CONSTRAINT "OAuthToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."OAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "public"."OAuthToken" ADD CONSTRAINT "OAuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "public"."OAuthToken" ADD CONSTRAINT "OAuthToken_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

