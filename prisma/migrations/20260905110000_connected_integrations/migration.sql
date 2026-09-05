-- Non-publishing external file-source connections (Google Drive/Photos,
-- Dropbox, OneDrive, Canva, ...). See src/lib/integrations/*.
CREATE TABLE "ConnectedIntegration" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "accountEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT,
    "metadata" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "ConnectedIntegration_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConnectedIntegration_workspaceId_idx" ON "ConnectedIntegration"("workspaceId");
CREATE UNIQUE INDEX "ConnectedIntegration_workspaceId_provider_key" ON "ConnectedIntegration"("workspaceId", "provider");

ALTER TABLE "ConnectedIntegration" ADD CONSTRAINT "ConnectedIntegration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
