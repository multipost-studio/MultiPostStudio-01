import { describe, it, expect } from "vitest";
import { UNTRACKED } from "./attribution";
import { buildReport, marketingInsights, type SignupRow, type VisitRow } from "./marketing-report";

const NOW = new Date("2026-10-05T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const visit = (visitorId: string, channel: string, source: string | null, campaign: string | null = null, n = 1): VisitRow => ({
  visitorId,
  createdAt: day(n),
  channel,
  source,
  medium: null,
  campaign,
  referrerHost: null,
  landingPath: "/",
});

const attr = (channel: string, source: string | null, campaign: string | null = null) => ({
  channel,
  source,
  medium: null,
  campaign,
  referrerHost: null,
  landingPath: "/",
  lastChannel: channel,
  lastSource: source,
  lastMedium: null,
  lastCampaign: campaign,
});

const signup = (a: ReturnType<typeof attr> | null, o: Partial<SignupRow> = {}, n = 1): SignupRow => ({
  createdAt: day(n),
  attribution: a,
  activated: false,
  paid: false,
  mrr: { usd: 0, inr: 0 },
  ...o,
});

describe("buildReport", () => {
  it("counts unique visitors per group and totals them once", () => {
    const r = buildReport({
      visits: [visit("a", "Paid Search", "google"), visit("a", "Paid Search", "google"), visit("b", "Paid Search", "google"), visit("a", "Organic Social", "facebook")],
      signups: [],
      groupBy: "channel",
      touch: "first",
      days: 7,
      now: NOW,
    });
    const ps = r.rows.find((x) => x.key === "Paid Search")!;
    expect(ps).toMatchObject({ visitors: 2, visits: 3 });
    expect(r.totals.visitors).toBe(2); // a and b, not 3
    expect(r.totals.visits).toBe(4);
  });

  it("attributes signups by first or last touch", () => {
    const a = { ...attr("Organic Social", "facebook"), lastChannel: "Email", lastSource: "newsletter" };
    const first = buildReport({ visits: [], signups: [signup(a)], groupBy: "source", touch: "first", days: 7, now: NOW });
    const last = buildReport({ visits: [], signups: [signup(a)], groupBy: "source", touch: "last", days: 7, now: NOW });
    expect(first.rows[0].key).toBe("facebook");
    expect(last.rows[0].key).toBe("newsletter");
  });

  it("puts users without attribution under (not tracked) and counts them", () => {
    const r = buildReport({ visits: [], signups: [signup(null), signup(null), signup(attr("Direct", null))], groupBy: "channel", touch: "first", days: 7, now: NOW });
    expect(r.totals.untrackedSignups).toBe(2);
    expect(r.rows.find((x) => x.key === UNTRACKED)!.signups).toBe(2);
  });

  it("computes signup rate only where there are tracked visitors", () => {
    const r = buildReport({
      visits: [visit("a", "Paid Search", "google"), visit("b", "Paid Search", "google"), visit("c", "Paid Search", "google"), visit("d", "Paid Search", "google")],
      signups: [signup(attr("Paid Search", "google")), signup(null)],
      groupBy: "channel",
      touch: "first",
      days: 7,
      now: NOW,
    });
    expect(r.rows.find((x) => x.key === "Paid Search")!.signupRate).toBeCloseTo(0.25);
    expect(r.rows.find((x) => x.key === UNTRACKED)!.signupRate).toBeNull();
  });

  it("sums activation, paid and MRR per currency", () => {
    const a = attr("Email", "newsletter");
    const r = buildReport({
      visits: [],
      signups: [
        signup(a, { activated: true, paid: true, mrr: { usd: 2900, inr: 0 } }),
        signup(a, { activated: true, paid: true, mrr: { usd: 0, inr: 79900 } }),
        signup(a),
      ],
      groupBy: "channel",
      touch: "first",
      days: 7,
      now: NOW,
    });
    expect(r.rows[0]).toMatchObject({ signups: 3, activated: 2, paid: 2, mrr: { usd: 2900, inr: 79900 } });
    expect(r.totals.mrr).toEqual({ usd: 2900, inr: 79900 });
  });

  it("builds a daily series with unique visitors per day and signups", () => {
    const r = buildReport({
      visits: [visit("a", "Direct", null, null, 0), visit("a", "Direct", null, null, 0), visit("b", "Direct", null, null, 0), visit("a", "Direct", null, null, 2)],
      signups: [signup(attr("Direct", null), {}, 0)],
      groupBy: "channel",
      touch: "first",
      days: 3,
      now: NOW,
    });
    expect(r.series).toHaveLength(3);
    expect(r.series[2]).toMatchObject({ visitors: 2, signups: 1 });
    expect(r.series[0].visitors).toBe(1);
  });

  it("groups by campaign, landing page and referrer with a '(none)' bucket", () => {
    const v = [
      { ...visit("a", "Referral", "x", "launch"), landingPath: "/pricing", referrerHost: "news.site" },
      { ...visit("b", "Direct", null, null), landingPath: "/", referrerHost: null },
    ];
    expect(buildReport({ visits: v, signups: [], groupBy: "campaign", touch: "first", days: 7, now: NOW }).rows.map((x) => x.key).sort()).toEqual(["(none)", "launch"]);
    expect(buildReport({ visits: v, signups: [], groupBy: "landing", touch: "first", days: 7, now: NOW }).rows.map((x) => x.key).sort()).toEqual(["/", "/pricing"]);
    expect(buildReport({ visits: v, signups: [], groupBy: "referrer", touch: "first", days: 7, now: NOW }).rows.map((x) => x.key).sort()).toEqual(["(none)", "news.site"]);
  });
});

describe("marketingInsights", () => {
  const many = (id: string, n: number, channel: string, source: string) => Array.from({ length: n }, (_, i) => visit(`${id}${i}`, channel, source));
  const sign = (n: number, channel: string, source: string, o: Partial<SignupRow> = {}) => Array.from({ length: n }, () => signup(attr(channel, source), o));

  it("says nothing when there isn't enough data (no noise on tiny samples)", () => {
    const r = buildReport({ visits: many("a", 3, "Paid Search", "google"), signups: sign(1, "Paid Search", "google"), groupBy: "source", touch: "first", days: 30, now: NOW });
    expect(marketingInsights(r)).toEqual([]);
  });

  it("flags a data-quality problem when many signups are untracked", () => {
    const r = buildReport({ visits: [], signups: [...Array.from({ length: 8 }, () => signup(null)), ...sign(4, "Direct", "x")], groupBy: "channel", touch: "first", days: 30, now: NOW });
    expect(marketingInsights(r).map((i) => i.id)).toContain("untracked");
  });

  it("finds the best converter only with enough visitors and signups", () => {
    const visits = [...many("g", 200, "Paid Search", "google"), ...many("f", 200, "Organic Social", "facebook")];
    const signups = [...sign(20, "Paid Search", "google"), ...sign(2, "Organic Social", "facebook")];
    const r = buildReport({ visits, signups, groupBy: "source", touch: "first", days: 30, now: NOW });
    const best = marketingInsights(r).find((i) => i.id === "best-converter");
    expect(best?.title).toMatch(/^google converts/);
    expect(best?.about).toEqual({ groupBy: "source", key: "google" });
  });

  it("flags traffic that never signs up, but not '(none)' or tiny traffic", () => {
    const visits = [...many("w", 150, "Display", "adnet"), ...many("t", 20, "Email", "mail")];
    const r = buildReport({ visits, signups: [], groupBy: "source", touch: "first", days: 30, now: NOW });
    const waste = marketingInsights(r).filter((i) => i.id === "no-signups");
    expect(waste).toHaveLength(1);
    expect(waste[0].title).toContain("adnet");
  });

  it("reports a meaningful trend vs the previous period", () => {
    const r = buildReport({ visits: [], signups: sign(12, "Direct", "x"), groupBy: "channel", touch: "first", days: 30, now: NOW, previous: { visitors: 100, signups: 6 } });
    const t = marketingInsights(r).find((i) => i.id === "trend");
    expect(t?.tone).toBe("good");
    expect(t?.title).toMatch(/up 100%/);
  });

  it("warns about audiences that sign up but never activate", () => {
    const r = buildReport({ visits: [], signups: sign(12, "Paid Social", "tiktok"), groupBy: "source", touch: "first", days: 30, now: NOW });
    expect(marketingInsights(r).map((i) => i.id)).toContain("low-activation");
  });
});
