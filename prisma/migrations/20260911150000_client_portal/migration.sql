-- Client guest review portal: shareable, tokenized links that let an
-- external client approve/reject posts without a Cadence account.

ALTER TABLE "ApprovalAction" ALTER COLUMN "actorId" DROP NOT NULL;
ALTER TABLE "ApprovalAction" ADD COLUMN "actorLabel" TEXT;

CREATE TABLE "PortalLink" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortalLink_token_key" ON "PortalLink"("token");
CREATE INDEX "PortalLink_workspaceId_idx" ON "PortalLink"("workspaceId");

ALTER TABLE "PortalLink" ADD CONSTRAINT "PortalLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortalLink" ADD CONSTRAINT "PortalLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
