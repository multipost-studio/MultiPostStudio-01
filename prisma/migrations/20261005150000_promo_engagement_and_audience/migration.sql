-- Follow-up to 20261005120000_promo_cards_and_ui_prefs (already applied in production):
--  1. acquired-from targeting on promo cards
--  2. per-user engagement (dismissed / first viewed / first clicked) replacing the dismissal-only table

-- AlterTable
ALTER TABLE "public"."PromoCard" ADD COLUMN "targetAudience" TEXT NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "public"."PromoCardEngagement" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCardEngagement_pkey" PRIMARY KEY ("id")
);

-- Keep every existing dismissal.
INSERT INTO "public"."PromoCardEngagement" ("id", "cardId", "userId", "dismissedAt", "createdAt")
SELECT "id", "cardId", "userId", "dismissedAt", "dismissedAt" FROM "public"."PromoCardDismissal";

-- DropTable
DROP TABLE "public"."PromoCardDismissal";

-- CreateIndex
CREATE INDEX "PromoCardEngagement_userId_idx" ON "public"."PromoCardEngagement"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCardEngagement_cardId_userId_key" ON "public"."PromoCardEngagement"("cardId", "userId");

-- AddForeignKey
ALTER TABLE "public"."PromoCardEngagement" ADD CONSTRAINT "PromoCardEngagement_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "public"."PromoCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PromoCardEngagement" ADD CONSTRAINT "PromoCardEngagement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
