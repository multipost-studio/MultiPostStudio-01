CREATE TABLE "HashtagGroup" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HashtagGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HashtagGroup_workspaceId_name_key" ON "HashtagGroup"("workspaceId", "name");

ALTER TABLE "HashtagGroup" ADD CONSTRAINT "HashtagGroup_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
