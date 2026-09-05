-- Inbound webhook idempotency. Stripe/Razorpay retry on timeout or 5xx and can
-- be replayed by hand from their dashboards; without a dedup record a duplicate
-- delivery re-applies the plan, mirrors a second invoice and re-grants referral
-- credits.
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebhookEvent_provider_eventId_key" ON "WebhookEvent"("provider", "eventId");
CREATE INDEX "WebhookEvent_receivedAt_idx" ON "WebhookEvent"("receivedAt");

-- One reward per side per referral, enforced by the database. The app-level
-- rewardedReferrer/rewardedReferee booleans are a read-then-write check, so two
-- concurrent grants could both observe "not yet rewarded" and both insert.
CREATE UNIQUE INDEX "ReferralReward_referralId_side_key" ON "ReferralReward"("referralId", "side");
