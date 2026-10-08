import { describe, it, expect } from "vitest";
import { DEFAULT_REVIEW_CONFIG, normalizeReviewConfig, parseReviewConfig } from "./config";
import { adminReviewSchema, initialsOf, isPubliclyVisible, reviewFingerprint, summarize, userReviewSchema } from "./model";
import { shouldAsk, snoozeUntil, type PromptFacts } from "./prompt";
import { MAX_IMPORT_ROWS, parseReviewImport, reviewsToCsv, reviewsToJson } from "./transfer";

describe("review settings", () => {
  it("fills anything missing from the defaults, one level deep", () => {
    const r = parseReviewConfig({ prompt: { snoozeDays: 30 }, display: { landing: false } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.prompt.snoozeDays).toBe(30);
      expect(r.config.prompt.minAccountDays).toBe(DEFAULT_REVIEW_CONFIG.prompt.minAccountDays);
      expect(r.config.display.landing).toBe(false);
      expect(r.config.display.page).toBe(true);
    }
  });

  it("rejects out-of-range numbers and non-https review-site links, naming the field", () => {
    const bad = parseReviewConfig({ prompt: { maxAsks: 99 }, externalLinks: [{ id: "a", label: "G2", url: "http://g2.com/x" }] });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors.join(" ")).toMatch(/prompt\.maxAsks/);
      expect(bad.errors.join(" ")).toMatch(/externalLinks\.0\.url/);
    }
  });

  it("falls back to the defaults for a damaged saved row instead of throwing", () => {
    expect(normalizeReviewConfig("garbage")).toEqual(DEFAULT_REVIEW_CONFIG);
    expect(normalizeReviewConfig({ prompt: { delaySeconds: -5 } })).toEqual(DEFAULT_REVIEW_CONFIG);
  });
});

describe("review validation", () => {
  const ok = { rating: 5, title: "", body: "Scheduling a week of posts takes minutes.", displayName: "Maya Chen", role: "", publicConsent: true };

  it("accepts a normal review and turns blank optional fields into null", () => {
    const r = userReviewSchema.parse(ok);
    expect(r.title).toBeNull();
    expect(r.role).toBeNull();
  });

  it("needs real text to publish, but lets a rating-only review stay private", () => {
    expect(userReviewSchema.safeParse({ ...ok, body: "great" }).success).toBe(false);
    expect(userReviewSchema.safeParse({ ...ok, body: "", publicConsent: false }).success).toBe(true);
  });

  it("keeps the rating a whole number from 1 to 5", () => {
    for (const rating of [0, 6, 3.5]) expect(userReviewSchema.safeParse({ ...ok, rating }).success).toBe(false);
  });

  it("limits what an admin can attach: https only for photo and source", () => {
    const base = { authorName: "A", rating: 4, body: "x", status: "pending", featured: false, sortOrder: 0 };
    expect(adminReviewSchema.safeParse({ ...base, sourceUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(adminReviewSchema.safeParse({ ...base, avatarUrl: "http://example.com/a.png" }).success).toBe(false);
    expect(adminReviewSchema.safeParse({ ...base, sourceUrl: "https://example.com/r/1" }).success).toBe(true);
  });
});

describe("review maths and visibility", () => {
  it("summarises ratings, ignoring junk", () => {
    const s = summarize([5, 5, 4, 1, 0, 7, 2.5]);
    expect(s.count).toBe(4);
    expect(s.average).toBe(3.8);
    expect(s.distribution).toEqual([2, 1, 0, 0, 1]);
    expect(summarize([])).toEqual({ count: 0, average: 0, distribution: [0, 0, 0, 0, 0] });
  });

  it("shows an in-app review only when approved AND the author agreed", () => {
    expect(isPubliclyVisible({ status: "approved", source: "in_app", publicConsent: true })).toBe(true);
    expect(isPubliclyVisible({ status: "approved", source: "in_app", publicConsent: false })).toBe(false);
    expect(isPubliclyVisible({ status: "pending", source: "in_app", publicConsent: true })).toBe(false);
    expect(isPubliclyVisible({ status: "approved", source: "manual", publicConsent: false })).toBe(true);
  });

  it("builds initials and fingerprints", () => {
    expect(initialsOf("Maya Chen")).toBe("MC");
    expect(initialsOf("  prince  ")).toBe("P");
    expect(initialsOf("")).toBe("?");
    expect(reviewFingerprint({ authorName: " Maya ", rating: 5, body: "Great   tool" })).toBe(reviewFingerprint({ authorName: "maya", rating: 5, body: "great tool" }));
  });
});

describe("when to ask for a review", () => {
  const cfg = DEFAULT_REVIEW_CONFIG.prompt;
  const now = new Date("2026-10-08T12:00:00Z");
  const base: PromptFacts = { now, userCreatedAt: new Date("2026-09-01T00:00:00Z"), publishedPosts: 10, isPaid: false, hasReview: false, state: null };

  it("asks an established, active, never-asked user", () => {
    expect(shouldAsk(cfg, base)).toEqual({ ask: true, reason: "eligible" });
  });

  it.each([
    ["disabled", { ...cfg, enabled: false }, base],
    ["already-reviewed", cfg, { ...base, hasReview: true }],
    ["already-reviewed", cfg, { ...base, state: { askCount: 1, snoozeUntil: null, status: "reviewed" } }],
    ["declined", cfg, { ...base, state: { askCount: 1, snoozeUntil: null, status: "declined" } }],
    ["asked-enough", cfg, { ...base, state: { askCount: cfg.maxAsks, snoozeUntil: null, status: "active" } }],
    ["snoozed", cfg, { ...base, state: { askCount: 1, snoozeUntil: new Date("2026-10-20T00:00:00Z"), status: "active" } }],
    ["too-new", cfg, { ...base, userCreatedAt: new Date("2026-10-05T00:00:00Z") }],
    ["not-enough-posts", cfg, { ...base, publishedPosts: 1 }],
    ["audience", { ...cfg, audience: "paid" as const }, base],
  ])("stays quiet: %s", (reason, config, facts) => {
    expect(shouldAsk(config, facts)).toEqual({ ask: false, reason });
  });

  it("asks again once a snooze has passed, and treats paid users as eligible for a paid-only audience", () => {
    expect(shouldAsk(cfg, { ...base, state: { askCount: 1, snoozeUntil: new Date("2026-10-01T00:00:00Z"), status: "active" } }).ask).toBe(true);
    expect(shouldAsk({ ...cfg, audience: "paid" }, { ...base, isPaid: true }).ask).toBe(true);
  });

  it("computes the snooze end", () => {
    expect(snoozeUntil(now, 14).toISOString()).toBe("2026-10-22T12:00:00.000Z");
  });
});

describe("export and import", () => {
  const rows = [
    { authorName: "Maya Chen", authorRole: "Social lead, Acme", rating: 5, title: "Saves hours", body: 'We "love" it, honestly.\nSecond line.', status: "approved" as const, featured: true, sortOrder: 1, source: "manual" as const, sourceUrl: "https://g2.com/r/1", avatarUrl: null, adminReply: null, createdAt: new Date("2026-09-30T10:00:00Z") },
  ];

  it("round-trips a review through CSV, quotes and line breaks intact", () => {
    const parsed = parseReviewImport(reviewsToCsv(rows));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const [r] = parsed.reviews;
      expect(r.authorName).toBe("Maya Chen");
      expect(r.body).toBe('We "love" it, honestly.\nSecond line.');
      expect(r.status).toBe("approved");
      expect(r.featured).toBe(true);
      expect(r.sourceUrl).toBe("https://g2.com/r/1");
      expect(r.createdAt?.toISOString()).toBe("2026-09-30T10:00:00.000Z");
    }
  });

  it("round-trips through JSON, and also accepts a bare array", () => {
    const viaObject = parseReviewImport(reviewsToJson(rows));
    expect(viaObject.ok && viaObject.reviews[0].authorName).toBe("Maya Chen");
    const viaArray = parseReviewImport(JSON.stringify([{ authorName: "A", rating: 4, body: "ok" }]));
    expect(viaArray.ok && viaArray.reviews[0].status).toBe("pending");
  });

  it("is all-or-nothing and names the bad row", () => {
    const res = parseReviewImport("authorName,rating,body\nGood,5,fine\n,9,bad row\n");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join(" ")).toMatch(/Row 2/);
  });

  it("cannot smuggle in an in-app review: that source is coerced to import", () => {
    const res = parseReviewImport(JSON.stringify([{ authorName: "A", rating: 5, body: "hello there", source: "in_app" }]));
    expect(res.ok && res.reviews[0].source).toBe("import");
  });

  it("drops duplicates inside the file and counts them", () => {
    const one = { authorName: "A", rating: 5, body: "same words here" };
    const res = parseReviewImport(JSON.stringify([one, { ...one }, { ...one, rating: 4 }]));
    expect(res.ok && res.reviews.length).toBe(2);
    expect(res.ok && res.duplicatesInFile).toBe(1);
  });

  it("refuses empty, oversized, headerless and unparseable files", () => {
    expect(parseReviewImport("").ok).toBe(false);
    expect(parseReviewImport("name,stars\nA,5").ok).toBe(false);
    expect(parseReviewImport("{ nope").ok).toBe(false);
    const many = JSON.stringify(Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => ({ authorName: `P${i}`, rating: 5, body: "x" })));
    const res = parseReviewImport(many);
    expect(res.ok).toBe(false);
  });
});
