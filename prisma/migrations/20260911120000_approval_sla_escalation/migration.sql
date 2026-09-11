ALTER TABLE "ApprovalStage" ADD COLUMN "timeoutHours" INTEGER;
ALTER TABLE "ApprovalStage" ADD COLUMN "timeoutAction" TEXT;
ALTER TABLE "ApprovalStage" ADD COLUMN "escalateToRole" TEXT;

ALTER TABLE "ApprovalRequest" ADD COLUMN "escalatedAt" TIMESTAMP(3);
