-- The AI-credit Referral system was retired and removed from the app (see
-- src/lib/affiliates.ts comment) — replaced by the Affiliate program. Schema
-- already dropped these models; this drops the orphaned tables from the
-- live database to match.

-- DropForeignKey
ALTER TABLE "public"."Referral" DROP CONSTRAINT "Referral_refereeId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Referral" DROP CONSTRAINT "Referral_referrerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ReferralReward" DROP CONSTRAINT "ReferralReward_referralId_fkey";

-- DropIndex
DROP INDEX "public"."User_referralCode_key";

-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "referralCode";

-- DropTable
DROP TABLE "public"."Referral";

-- DropTable
DROP TABLE "public"."ReferralReward";
