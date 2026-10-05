import { describe, it, expect } from "vitest";
import {
  describeFilter,
  effectivePlanKey,
  isEmptyFilter,
  matchesAudience,
  matchesPlan,
  normalizeAudienceTarget,
  normalizeSegmentFilter,
  segmentWhere,
} from "./audience";

describe("normalizeSegmentFilter", () => {
  it("turns garbage into the empty filter", () => {
    for (const bad of [null, undefined, 5, "nope", "{bad", [], { channels: ["Hacked"] }]) {
      expect(isEmptyFilter(normalizeSegmentFilter(bad))).toBe(true);
    }
  });

  it("canonicalises and dedupes sources, mediums and campaigns", () => {
    const f = normalizeSegmentFilter({ sources: ["FB", "facebook", "Google "], mediums: ["PPC"], campaigns: ["Spring Launch", "spring_launch"] });
    expect(f.sources).toEqual(["facebook", "google"]);
    expect(f.mediums).toEqual(["cpc"]);
    expect(f.campaigns).toEqual(["spring_launch"]);
  });

  it("accepts a JSON string (as stored)", () => {
    expect(normalizeSegmentFilter('{"channels":["Email"],"touch":"last"}')).toMatchObject({ channels: ["Email"], touch: "last" });
  });

  it("rejects malformed dates", () => {
    expect(normalizeSegmentFilter({ from: "yesterday" }).from).toBeNull();
    expect(normalizeSegmentFilter({ from: "2026-10-01", to: "2026-10-31" })).toMatchObject({ from: "2026-10-01", to: "2026-10-31" });
  });
});

describe("segmentWhere", () => {
  it("always excludes deleted users and filters attribution by the chosen touch", () => {
    const first = segmentWhere(normalizeSegmentFilter({ sources: ["google"], channels: ["Paid Search"] }));
    expect(first).toEqual({ deletedAt: null, attribution: { channel: { in: ["Paid Search"] }, source: { in: ["google"] } } });
    const last = segmentWhere(normalizeSegmentFilter({ sources: ["google"], touch: "last" }));
    expect(last.attribution).toEqual({ lastSource: { in: ["google"] } });
  });

  it("adds an inclusive date range", () => {
    const w = segmentWhere(normalizeSegmentFilter({ from: "2026-10-01", to: "2026-10-31" })) as { createdAt: { gte: Date; lte: Date } };
    expect(w.createdAt.gte.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(w.createdAt.lte.toISOString()).toBe("2026-10-31T23:59:59.999Z");
  });

  it("empty filter matches every live user", () => {
    expect(segmentWhere(normalizeSegmentFilter({}))).toEqual({ deletedAt: null });
  });
});

describe("effectivePlanKey", () => {
  const sub = (key: string, price: number, status = "active", extra = {}) => ({ status, plan: { key, priceMonthly: price }, ...extra });
  it("is free with no entitled subscription", () => {
    expect(effectivePlanKey([])).toBe("free");
    expect(effectivePlanKey([null, undefined])).toBe("free");
    expect(effectivePlanKey([sub("pro", 2900, "canceled", { currentPeriodEnd: new Date(Date.now() - 86_400_000) })])).toBe("free");
  });

  it("picks the most expensive entitled plan across orgs", () => {
    expect(effectivePlanKey([sub("pro", 2900), sub("team", 7900), sub("free", 0)])).toBe("team");
  });

  it("matchesPlan treats an empty plan list as everyone", () => {
    expect(matchesPlan(normalizeSegmentFilter({}), "free")).toBe(true);
    expect(matchesPlan(normalizeSegmentFilter({ plans: ["pro"] }), "free")).toBe(false);
  });
});

describe("matchesAudience (promo targeting)", () => {
  const who = { channel: "Paid Search", source: "google", campaign: "spring_launch" };
  it("empty target matches everyone including untracked users", () => {
    expect(matchesAudience(normalizeAudienceTarget({}), null)).toBe(true);
    expect(matchesAudience(normalizeAudienceTarget(null), who)).toBe(true);
  });

  it("untracked users never match a targeted card", () => {
    expect(matchesAudience(normalizeAudienceTarget({ sources: ["google"] }), null)).toBe(false);
  });

  it("ORs within a dimension and ANDs across dimensions", () => {
    expect(matchesAudience(normalizeAudienceTarget({ sources: ["bing", "google"] }), who)).toBe(true);
    expect(matchesAudience(normalizeAudienceTarget({ sources: ["google"], channels: ["Email"] }), who)).toBe(false);
    expect(matchesAudience(normalizeAudienceTarget({ sources: ["google"], campaigns: ["spring_launch"] }), who)).toBe(true);
    expect(matchesAudience(normalizeAudienceTarget({ campaigns: ["other"] }), who)).toBe(false);
  });

  it("a user with no source never matches a source-targeted card", () => {
    expect(matchesAudience(normalizeAudienceTarget({ sources: ["google"] }), { channel: "Direct", source: null, campaign: null })).toBe(false);
  });
});

describe("describeFilter", () => {
  it("reads naturally", () => {
    expect(describeFilter(normalizeSegmentFilter({}))).toBe("Everyone");
    expect(describeFilter(normalizeSegmentFilter({ channels: ["Email"], campaigns: ["oct"], touch: "last" }))).toBe("Email · campaign oct (last touch)");
  });
});
