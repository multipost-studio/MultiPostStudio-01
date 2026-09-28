-- DropForeignKey
ALTER TABLE "public"."ApprovalAction" DROP CONSTRAINT "ApprovalAction_actorId_fkey";

-- DropIndex
DROP INDEX "public"."Membership_customRoleId_idx";

-- AlterTable
ALTER TABLE "public"."Workspace" ADD COLUMN     "defaultAiProvider" TEXT;

-- CreateTable
CREATE TABLE "public"."AiProviderCredential" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedApiKey" TEXT NOT NULL,
    "keyLast4" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "defaultModel" TEXT,
    "connectedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastValidatedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "AiProviderCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiProviderCredential_workspaceId_idx" ON "public"."AiProviderCredential"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "AiProviderCredential_workspaceId_provider_key" ON "public"."AiProviderCredential"("workspaceId", "provider");

-- AddForeignKey
ALTER TABLE "public"."AiProviderCredential" ADD CONSTRAINT "AiProviderCredential_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ApprovalAction" ADD CONSTRAINT "ApprovalAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
