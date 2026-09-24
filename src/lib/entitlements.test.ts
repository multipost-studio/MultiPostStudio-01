import { describe, expect, it } from "vitest";
import { isSubscriptionEntitled, PAST_DUE_GRACE_DAYS } from "@/lib/entitlements";

describe("isSubscriptionEntitled billing lifecycle & grace periods", () => {
  const now = Date.now();

  it("entitles active subscriptions unconditionally", () => {
    expect(
      isSubscriptionEntitled({
        status: "active",
        currentPeriodEnd: new Date(now + 86_400_000 * 30),
      }),
    ).toBe(true);

    // Active even right at renewal boundary
    expect(
      isSubscriptionEntitled({
        status: "active",
        currentPeriodEnd: new Date(now - 1000),
      }),
    ).toBe(true);
  });

  describe("trialing status", () => {
    it("entitles trialing subscriptions when trialEndsAt is in future", () => {
      expect(
        isSubscriptionEntitled({
          status: "trialing",
          trialEndsAt: new Date(now + 86_400_000 * 3),
        }),
      ).toBe(true);
    });

    it("denies trialing subscriptions once trialEndsAt has passed", () => {
      expect(
        isSubscriptionEntitled({
          status: "trialing",
          trialEndsAt: new Date(now - 86_400_000 * 1),
        }),
      ).toBe(false);
    });

    it("falls back to currentPeriodEnd for trialing when trialEndsAt is null", () => {
      expect(
        isSubscriptionEntitled({
          status: "trialing",
          currentPeriodEnd: new Date(now + 86_400_000 * 2),
        }),
      ).toBe(true);

      expect(
        isSubscriptionEntitled({
          status: "trialing",
          currentPeriodEnd: new Date(now - 86_400_000 * 2),
        }),
      ).toBe(false);
    });
  });

  describe("past_due status & grace period", () => {
    it(`entitles past_due subscriptions within the ${PAST_DUE_GRACE_DAYS}-day grace period`, () => {
      // Failed payment 2 days ago (within 7-day grace)
      const twoDaysAgo = new Date(now - 2 * 86_400_000);
      expect(
        isSubscriptionEntitled({
          status: "past_due",
          currentPeriodEnd: twoDaysAgo,
        }),
      ).toBe(true);
    });

    it(`denies past_due subscriptions when the ${PAST_DUE_GRACE_DAYS}-day grace period expires`, () => {
      // Failed payment 10 days ago (beyond 7-day grace)
      const tenDaysAgo = new Date(now - 10 * 86_400_000);
      expect(
        isSubscriptionEntitled({
          status: "past_due",
          currentPeriodEnd: tenDaysAgo,
        }),
      ).toBe(false);
    });

    it("denies past_due subscriptions without currentPeriodEnd", () => {
      expect(
        isSubscriptionEntitled({
          status: "past_due",
          currentPeriodEnd: null,
        }),
      ).toBe(false);
    });
  });

  describe("canceled status & prepaid period preservation", () => {
    it("entitles canceled subscription until the end of the paid period", () => {
      // User canceled, but has 15 days left on paid billing cycle
      const fifteenDaysFromNow = new Date(now + 15 * 86_400_000);
      expect(
        isSubscriptionEntitled({
          status: "canceled",
          currentPeriodEnd: fifteenDaysFromNow,
          canceledAt: new Date(now - 86_400_000),
        }),
      ).toBe(true);
    });

    it("denies canceled subscription after the prepaid period has ended", () => {
      // Paid period ended yesterday
      const yesterday = new Date(now - 86_400_000);
      expect(
        isSubscriptionEntitled({
          status: "canceled",
          currentPeriodEnd: yesterday,
          canceledAt: new Date(now - 30 * 86_400_000),
        }),
      ).toBe(false);
    });
  });

  describe("restricted and non-entitled statuses", () => {
    it("denies unpaid status immediately", () => {
      expect(
        isSubscriptionEntitled({
          status: "unpaid",
          currentPeriodEnd: new Date(now + 86_400_000 * 10),
        }),
      ).toBe(false);
    });

    it("denies incomplete status immediately", () => {
      expect(
        isSubscriptionEntitled({
          status: "incomplete",
          currentPeriodEnd: new Date(now + 86_400_000 * 10),
        }),
      ).toBe(false);
    });

    it("denies incomplete_expired status immediately", () => {
      expect(
        isSubscriptionEntitled({
          status: "incomplete_expired",
          currentPeriodEnd: new Date(now - 86_400_000 * 10),
        }),
      ).toBe(false);
    });

    it("denies paused status immediately", () => {
      expect(
        isSubscriptionEntitled({
          status: "paused",
          currentPeriodEnd: new Date(now + 86_400_000 * 10),
        }),
      ).toBe(false);
    });
  });
});
