CREATE TABLE "SocialContact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "displayName" TEXT,
    "tags" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SocialContact_workspaceId_platform_handle_key" ON "SocialContact"("workspaceId", "platform", "handle");

ALTER TABLE "SocialContact" ADD CONSTRAINT "SocialContact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
