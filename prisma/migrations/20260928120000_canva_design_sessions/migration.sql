CREATE TABLE "CanvaDesignSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "folderId" TEXT,
    "designId" TEXT,
    "returnTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CanvaDesignSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CanvaDesignSession_workspaceId_idx" ON "CanvaDesignSession"("workspaceId");

ALTER TABLE "CanvaDesignSession" ADD CONSTRAINT "CanvaDesignSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
