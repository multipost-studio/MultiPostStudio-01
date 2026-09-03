-- AlterTable
ALTER TABLE "public"."Membership" ADD COLUMN "customRoleId" TEXT;

-- CreateTable
CREATE TABLE "public"."CustomRole" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomRole_orgId_idx" ON "public"."CustomRole"("orgId");
CREATE INDEX "Membership_customRoleId_idx" ON "public"."Membership"("customRoleId");

-- AddForeignKey
ALTER TABLE "public"."CustomRole" ADD CONSTRAINT "CustomRole_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."Membership" ADD CONSTRAINT "Membership_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "public"."CustomRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
