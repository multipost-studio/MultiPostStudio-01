-- Native INR prices move into the Plan table so /admin/plans is the single
-- source of truth for every currency. Previously priceMonthlyInr/priceAnnualInr
-- lived only in src/lib/constants.ts (PLAN_CATALOG), which meant an admin
-- editing the USD price left the INR price -- and the amount actually charged
-- by src/lib/adapters/billing.ts -- unchanged.
ALTER TABLE "Plan" ADD COLUMN "priceMonthlyInr" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Plan" ADD COLUMN "priceAnnualInr"  INTEGER NOT NULL DEFAULT 0;

-- Backfill with the catalog values that were previously hardcoded, so live
-- pricing is unchanged by this migration. Keyed by plan key; any plan not
-- listed keeps 0 (no INR price offered), which is the pre-existing behaviour
-- for free/enterprise.
UPDATE "Plan" SET "priceMonthlyInr" =   149900, "priceAnnualInr" =  1499000 WHERE "key" = 'pro';
UPDATE "Plan" SET "priceMonthlyInr" =   399900, "priceAnnualInr" =  3999000 WHERE "key" = 'team';
UPDATE "Plan" SET "priceMonthlyInr" =  1049900, "priceAnnualInr" = 10499000 WHERE "key" = 'agency';
