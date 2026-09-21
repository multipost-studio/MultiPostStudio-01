-- AlterTable
ALTER TABLE "ApprovalRequest" ADD COLUMN "resubmissionCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ApprovalAction" ADD COLUMN "reasonCategory" TEXT;
