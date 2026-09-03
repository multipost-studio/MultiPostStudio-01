-- AlterTable
ALTER TABLE "public"."Organization" ADD COLUMN     "billingAddress" TEXT,
ADD COLUMN     "billingCountry" TEXT,
ADD COLUMN     "billingEmail" TEXT,
ADD COLUMN     "billingName" TEXT,
ADD COLUMN     "taxId" TEXT;
