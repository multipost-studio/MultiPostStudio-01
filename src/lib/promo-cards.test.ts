import { describe, it, expect } from "vitest";
import { promoCardSchema, promoStatus, selectVisiblePromoCards, isSafeCtaUrl, type PromoCardData } from "./promo-cards";

const base = {
  title: "Upgrade to Pro",
  description: "More channels and AI credits.",
  ctaText: "See plans",
  ctaUrl: "/settings/billing",
};

const NOW = new Date("2026-10-05T12:00:00Z");
const card = (o: Partial<Parameters<typeof selectVisiblePromoCards>[0][number]> & { id: string }) => ({
  title: "t",
  description: "d",
  ctaText: "c",
  ctaUrl: "/x",
  icon: null,
  imageUrl: null,
  tone: "brand" as const,
  dismissible: true,
  placement: "sidebar",
  priority: 0,
  enabled: true,
  archivedAt: null,
  startsAt: null,
  endsAt: null,
  targetPlans: "[]",
  createdAt: new Date("2026-10-01T00:00:00Z"),
  ...o,
}) satisfies PromoCardData & Record<string, unknown>;

describe("promoCardSchema", () => {
  it("accepts a valid card and applies defaults", () => {
    const r = promoCardSchema.parse(base);
    expect(r).toMatchObject({ tone: "brand", placement: "sidebar", priority: 0, enabled: false, dismissible: true, targetPlans: [] });
  });

  it.each(["javascript:alert(1)", "//evil.com", "http://insecure.com", "data:text/html,x", "/a\\b"])("rejects unsafe CTA url %s", (u) => {
    expect(promoCardSchema.safeParse({ ...base, ctaUrl: u }).success).toBe(false);
  });

  it("allows in-app paths and https links", () => {
    expect(isSafeCtaUrl("/integrations")).toBe(true);
    expect(isSafeCtaUrl("https://multipoststudio.online/pricing")).toBe(true);
  });

  it("rejects an end date before the start date", () => {
    const r = promoCardSchema.safeParse({ ...base, startsAt: "2026-10-10T00:00", endsAt: "2026-10-09T00:00" });
    expect(r.success).toBe(false);
  });

  it("rejects over-long copy and non-uploaded image urls", () => {
    expect(promoCardSchema.safeParse({ ...base, title: "x".repeat(61) }).success).toBe(false);
    expect(promoCardSchema.safeParse({ ...base, imageUrl: "javascript:1" }).success).toBe(false);
    expect(promoCardSchema.safeParse({ ...base, imageUrl: "/uploads/a.png" }).success).toBe(true);
  });
});

describe("promoStatus", () => {
  const f = { enabled: true, archivedAt: null, startsAt: null, endsAt: null };
  it("derives status in precedence order", () => {
    expect(promoStatus({ ...f, archivedAt: NOW }, NOW)).toBe("archived");
    expect(promoStatus({ ...f, enabled: false }, NOW)).toBe("paused");
    expect(promoStatus({ ...f, startsAt: new Date("2026-10-06T00:00:00Z") }, NOW)).toBe("scheduled");
    expect(promoStatus({ ...f, endsAt: new Date("2026-10-05T11:00:00Z") }, NOW)).toBe("expired");
    expect(promoStatus(f, NOW)).toBe("live");
  });
});

describe("selectVisiblePromoCards", () => {
  const opts = { now: NOW, placement: "sidebar" as const, planKey: "free", dismissedIds: new Set<string>() };

  it("hides paused, scheduled, expired and archived cards", () => {
    const cards = [
      card({ id: "live" }),
      card({ id: "paused", enabled: false }),
      card({ id: "future", startsAt: new Date("2026-11-01T00:00:00Z") }),
      card({ id: "past", endsAt: new Date("2026-09-01T00:00:00Z") }),
      card({ id: "arch", archivedAt: NOW }),
    ];
    expect(selectVisiblePromoCards(cards, opts).map((c) => c.id)).toEqual(["live"]);
  });

  it("targets by plan; empty target means everyone", () => {
    const cards = [card({ id: "all" }), card({ id: "pro-only", targetPlans: '["pro"]' }), card({ id: "free-only", targetPlans: '["free"]' })];
    expect(selectVisiblePromoCards(cards, opts).map((c) => c.id).sort()).toEqual(["all", "free-only"]);
    expect(selectVisiblePromoCards(cards, { ...opts, planKey: null }).map((c) => c.id)).toEqual(["all"]);
  });

  it("respects dismissals only for dismissible cards", () => {
    const cards = [card({ id: "a" }), card({ id: "sticky", dismissible: false })];
    const dismissedIds = new Set(["a", "sticky"]);
    expect(selectVisiblePromoCards(cards, { ...opts, dismissedIds }).map((c) => c.id)).toEqual(["sticky"]);
  });

  it("orders by priority then newest, and filters placement", () => {
    const cards = [
      card({ id: "low", priority: 1 }),
      card({ id: "high", priority: 9 }),
      card({ id: "newer", priority: 1, createdAt: new Date("2026-10-04T00:00:00Z") }),
      card({ id: "other", placement: "dashboard" }),
    ];
    expect(selectVisiblePromoCards(cards, opts).map((c) => c.id)).toEqual(["high", "newer", "low"]);
  });

  it("survives malformed targetPlans JSON as 'everyone'", () => {
    expect(selectVisiblePromoCards([card({ id: "x", targetPlans: "{oops" })], opts)).toHaveLength(1);
  });
});
