import { describe, it, expect } from "vitest";
import {
  buildUtmLink,
  canonicalMedium,
  canonicalSource,
  classifyChannel,
  cookieDomainFor,
  decodeTouch,
  encodeTouch,
  isLikelyBot,
  nextFirstTouch,
  nextLastTouch,
  parseTouch,
  sanitizeValue,
  trackingAllowed,
} from "./attribution";

const SELF = ["multipoststudio.online", "app.multipoststudio.online", "localhost"];
const touch = (landing: string, referrer?: string) => parseTouch({ landing, referrer, selfHosts: SELF, now: 1_700_000_000_000 });

describe("sanitizeValue / canonicalisation", () => {
  it("lowercases, trims and underscores, and strips junk", () => {
    expect(sanitizeValue("  Spring Launch 2026 ")).toBe("spring_launch_2026");
    const dirty = sanitizeValue("<script>alert(1)</script>")!;
    expect(dirty).not.toMatch(/[<>()]/);
    expect(sanitizeValue("")).toBeNull();
    expect(sanitizeValue(42)).toBeNull();
    expect(sanitizeValue("x".repeat(500))!.length).toBe(80);
  });

  it("merges common spellings of a source", () => {
    for (const s of ["fb", "Facebook", "facebook.com", "m.facebook.com", "l.facebook.com"]) expect(canonicalSource(s)).toBe("facebook");
    for (const s of ["twitter", "t.co", "x.com", "tw"]) expect(canonicalSource(s)).toBe("x");
    expect(canonicalSource("www.google.co.in")).toBe("google");
    expect(canonicalSource("my-newsletter")).toBe("my-newsletter");
  });

  it("merges common spellings of a medium", () => {
    expect(canonicalMedium("PPC")).toBe("cpc");
    expect(canonicalMedium("e-mail")).toBe("email");
    expect(canonicalMedium("newsletter")).toBe("email");
    expect(canonicalMedium("Paid-Social")).toBe("paid_social");
  });
});

describe("classifyChannel", () => {
  const c = (source: string | null, medium: string | null, extra: Partial<Parameters<typeof classifyChannel>[0]> = {}) =>
    classifyChannel({ source, medium, referrerHost: null, clickId: null, hasRef: false, ...extra });

  it("splits cpc by whether the source is a social network", () => {
    expect(c("google", "cpc")).toBe("Paid Search");
    expect(c("facebook", "cpc")).toBe("Paid Social");
    expect(c("linkedin", "paid_social")).toBe("Paid Social");
  });

  it("recognises email, affiliate, display, referral", () => {
    expect(c("mailchimp", "email")).toBe("Email");
    expect(c("newsletter", null)).toBe("Email");
    expect(c("partner_x", "affiliate")).toBe("Affiliate");
    expect(c(null, null, { hasRef: true })).toBe("Affiliate");
    expect(c("some-network", "display")).toBe("Display");
    expect(c("blog.example.com", "referral")).toBe("Referral");
  });

  it("falls back on the source when the medium is missing or unknown", () => {
    expect(c("google", null)).toBe("Organic Search");
    expect(c("instagram", null)).toBe("Organic Social");
    expect(c("random", "weird")).toBe("Other");
    expect(c(null, null, { referrerHost: "blog.example.com" })).toBe("Referral");
    expect(c(null, null)).toBe("Direct");
  });
});

describe("parseTouch", () => {
  it("reads full UTM tagging and normalises it", () => {
    const t = touch("/pricing?utm_source=Google&utm_medium=CPC&utm_campaign=Spring%20Launch&utm_term=social+scheduler&utm_content=ad_a");
    expect(t).toMatchObject({
      source: "google",
      medium: "cpc",
      campaign: "spring_launch",
      term: "social_scheduler",
      content: "ad_a",
      channel: "Paid Search",
      landingPath: "/pricing",
      signal: true,
    });
  });

  it("infers search from gclid when untagged", () => {
    const t = touch("/?gclid=abc123");
    expect(t).toMatchObject({ source: "google", medium: "cpc", channel: "Paid Search", clickId: "gclid", signal: true });
  });

  it("infers organic search / social / referral from the referrer alone", () => {
    expect(touch("/", "https://www.google.com/search?q=x")).toMatchObject({ source: "google", channel: "Organic Search", referrerHost: "google.com" });
    expect(touch("/", "https://l.facebook.com/l.php?u=x")).toMatchObject({ source: "facebook", channel: "Organic Social" });
    expect(touch("/", "https://some-blog.dev/post")).toMatchObject({ source: "some-blog.dev", channel: "Referral" });
  });

  it("treats our own hosts as no referrer (internal navigation is not acquisition)", () => {
    const t = touch("/features", "https://app.multipoststudio.online/login");
    expect(t).toMatchObject({ referrerHost: null, channel: "Direct", signal: false });
  });

  it("explicit UTM wins over the referrer", () => {
    const t = touch("/?utm_source=newsletter&utm_medium=email&utm_campaign=oct", "https://www.google.com/");
    expect(t).toMatchObject({ source: "newsletter", channel: "Email" });
  });

  it("marks affiliate visits via ?ref=", () => {
    expect(touch("/signup?ref=ABC123").channel).toBe("Affiliate");
  });

  it("survives garbage input", () => {
    expect(touch("not a url at all %%%").channel).toBe("Direct");
    expect(touch("/?utm_source=" + "a".repeat(1000)).source!.length).toBeLessThanOrEqual(80);
    expect(touch("/", "javascript:alert(1)").referrerHost).toBeNull();
  });

  it("plain direct visit carries no signal", () => {
    expect(touch("/")).toMatchObject({ channel: "Direct", signal: false, source: null });
  });
});

describe("touch cookie round-trip", () => {
  it("round-trips a valid touch", () => {
    const t = touch("/?utm_source=google&utm_medium=cpc&utm_campaign=x");
    expect(decodeTouch(encodeTouch(t))).toEqual(t);
  });

  it("rejects tampered, oversized and off-schema payloads", () => {
    expect(decodeTouch("not json")).toBeNull();
    expect(decodeTouch(null)).toBeNull();
    expect(decodeTouch("x".repeat(2000))).toBeNull();
    expect(decodeTouch(JSON.stringify({ channel: "Hacked", source: "a" }))).toBeNull();
    const t = touch("/?utm_source=google");
    expect(decodeTouch(JSON.stringify({ ...t, channel: "Nonsense" }))).toBeNull();
    expect(decodeTouch(JSON.stringify({ ...t, source: "x".repeat(500) }))).toBeNull();
  });
});

describe("privacy and bot filters", () => {
  const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
  it("honours DNT and GPC", () => {
    expect(trackingAllowed(h({}))).toBe(true);
    expect(trackingAllowed(h({ dnt: "1" }))).toBe(false);
    expect(trackingAllowed(h({ "sec-gpc": "1" }))).toBe(false);
  });

  it("filters bots and empty user agents", () => {
    expect(isLikelyBot("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36")).toBe(false);
    expect(isLikelyBot("Googlebot/2.1 (+http://www.google.com/bot.html)")).toBe(true);
    expect(isLikelyBot("curl/8.0")).toBe(true);
    expect(isLikelyBot(null)).toBe(true);
    expect(isLikelyBot("HeadlessChrome/120")).toBe(true);
  });

  it("shares cookies between marketing and app hosts only on our domain", () => {
    expect(cookieDomainFor("multipoststudio.online")).toBe(".multipoststudio.online");
    expect(cookieDomainFor("app.multipoststudio.online:443")).toBe(".multipoststudio.online");
    expect(cookieDomainFor("localhost:3000")).toBeUndefined();
    expect(cookieDomainFor("evil-multipoststudio.online.attacker.com")).toBeUndefined();
  });
});

describe("buildUtmLink", () => {
  const base = { url: "https://multipoststudio.online/pricing", source: "Google", medium: "CPC", campaign: "Spring Launch" };

  it("builds a normalised tagged link that parseTouch reads back identically", () => {
    const r = buildUtmLink({ ...base, term: "Social Scheduler", content: "Ad A" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const back = touch(new URL(r.link).pathname + new URL(r.link).search);
    expect(back).toMatchObject({ source: "google", medium: "cpc", campaign: "spring_launch", term: "social_scheduler", content: "ad_a", channel: "Paid Search" });
  });

  it("replaces existing UTMs but keeps other params and the hash", () => {
    const r = buildUtmLink({ ...base, url: "https://x.com/p?a=1&utm_source=old#faq" });
    expect(r.ok && r.link).toContain("a=1");
    expect(r.ok && r.link).toContain("utm_source=google");
    expect(r.ok && r.link).not.toContain("old");
    expect(r.ok && r.link).toContain("#faq");
  });

  it("validates required parts and the URL", () => {
    expect(buildUtmLink({ ...base, url: "pricing" }).ok).toBe(false);
    expect(buildUtmLink({ ...base, url: "javascript:alert(1)" }).ok).toBe(false);
    expect(buildUtmLink({ ...base, source: "" }).ok).toBe(false);
    expect(buildUtmLink({ ...base, medium: " " }).ok).toBe(false);
    expect(buildUtmLink({ ...base, campaign: "" }).ok).toBe(false);
  });

  it("warns when naming will be rewritten or lands in Other", () => {
    const renamed = buildUtmLink({ ...base, source: "FB", medium: "social" });
    expect(renamed.ok && renamed.warnings.join(" ")).toMatch(/facebook/);
    const other = buildUtmLink({ ...base, source: "somewhere", medium: "weirdthing" });
    expect(other.ok && other.warnings.join(" ")).toMatch(/Other/);
  });
});

describe("first / last touch rules", () => {
  const direct = touch("/");
  const google = touch("/?utm_source=google&utm_medium=cpc&utm_campaign=a");
  const email = touch("/?utm_source=newsletter&utm_medium=email&utm_campaign=b");

  it("first touch is kept once it carries a signal", () => {
    expect(nextFirstTouch(null, google)).toBe(google);
    expect(nextFirstTouch(google, email)).toBe(google);
    expect(nextFirstTouch(google, direct)).toBe(google);
  });

  it("a placeholder direct first touch is upgraded by the first real campaign", () => {
    expect(nextFirstTouch(direct, google)).toBe(google);
    expect(nextFirstTouch(direct, direct)).toBe(direct);
  });

  it("last touch follows the latest marketing signal and ignores direct returns", () => {
    expect(nextLastTouch(google, email)).toBe(email);
    expect(nextLastTouch(email, direct)).toBe(email);
    expect(nextLastTouch(null, direct)).toBe(direct);
  });
});
