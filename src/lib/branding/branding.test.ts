import { describe, it, expect } from "vitest";
import { DEFAULT_BRANDING_CONFIG, isImageUrl, newTag, normalizeBrandingConfig, parseBrandingConfig, type BrandingConfig, type CustomTag } from "./config";
import { formatStatValue, resolveStats } from "./stats";
import { metaAttr, partitionTags } from "./tags";

const tag = (patch: Partial<CustomTag>): CustomTag => ({ ...newTag(), name: "T", ...patch });
const withTags = (tags: CustomTag[]) => parseBrandingConfig({ tags });

describe("defaults", () => {
  it("are valid, and the invoice note matches what receipts said before this module existed", () => {
    expect(parseBrandingConfig(DEFAULT_BRANDING_CONFIG).ok).toBe(true);
    expect(DEFAULT_BRANDING_CONFIG.invoice.footerNote).toMatch(/not a jurisdiction-specific tax invoice/);
    expect(DEFAULT_BRANDING_CONFIG.stats.enabled).toBe(false);
  });
});

describe("custom tags", () => {
  it("accepts a verification meta tag and rejects a malformed one", () => {
    expect(withTags([tag({ kind: "meta", key: "google-site-verification", content: "abc123" })]).ok).toBe(true);
    expect(withTags([tag({ kind: "meta", key: "bad key!", content: "x" })]).ok).toBe(false);
    expect(withTags([tag({ kind: "meta", key: "ok", content: "  " })]).ok).toBe(false);
  });

  it("only takes https link tags", () => {
    expect(withTags([tag({ kind: "link", rel: "preconnect", href: "https://fonts.example.com" })]).ok).toBe(true);
    expect(withTags([tag({ kind: "link", rel: "preconnect", href: "http://insecure.example.com" })]).ok).toBe(false);
    expect(withTags([tag({ kind: "link", rel: "preconnect", href: "javascript:alert(1)" })]).ok).toBe(false);
  });

  it("scripts need exactly one of inline code or an allowed host", () => {
    expect(withTags([tag({ kind: "script", code: "window.x = 1;" })]).ok).toBe(true);
    expect(withTags([tag({ kind: "script", src: "https://www.googletagmanager.com/gtm.js?id=GTM-XXXX" })]).ok).toBe(true);
    expect(withTags([tag({ kind: "script" })]).ok).toBe(false);
    expect(withTags([tag({ kind: "script", code: "x", src: "https://www.googletagmanager.com/a.js" })]).ok).toBe(false);
  });

  it("refuses script hosts the security policy would block, and non-https sources", () => {
    const evil = withTags([tag({ kind: "script", src: "https://evil.example.com/a.js" })]);
    expect(evil.ok).toBe(false);
    if (!evil.ok) expect(evil.errors.join(" ")).toMatch(/security policy/);
    expect(withTags([tag({ kind: "script", src: "http://www.googletagmanager.com/a.js" })]).ok).toBe(false);
    expect(withTags([tag({ kind: "script", src: "javascript:alert(1)" })]).ok).toBe(false);
  });

  it("splits tags into server-written head tags and browser-added scripts, dropping disabled ones", () => {
    const { head, scripts } = partitionTags([
      tag({ id: "a", kind: "meta", key: "og:site_name", content: "X" }),
      tag({ id: "b", kind: "link", rel: "me", href: "https://example.com" }),
      tag({ id: "c", kind: "script", code: "1", consent: "essential", placement: "body" }),
      tag({ id: "d", kind: "script", code: "2", enabled: false }),
    ]);
    expect(head.map((h) => h.id)).toEqual(["a", "b"]);
    expect(scripts).toEqual([{ id: "c", placement: "body", consent: "essential", src: "", code: "1" }]);
  });

  it("writes Open Graph style keys as property and the rest as name", () => {
    expect(metaAttr("og:image")).toBe("property");
    expect(metaAttr("fb:app_id")).toBe("property");
    expect(metaAttr("google-site-verification")).toBe("name");
  });
});

describe("share image and invoice", () => {
  it("takes a site path or https image, and a clean twitter handle", () => {
    for (const ok of ["/media/cover-01.svg", "https://cdn.example.com/og.png"]) expect(isImageUrl(ok), ok).toBe(true);
    for (const bad of ["http://x.com/a.png", "//x.com/a.png", "javascript:alert(1)", "data:image/png;base64,AAA"]) expect(isImageUrl(bad), bad).toBe(false);
    expect(parseBrandingConfig({ share: { twitterHandle: "@multipost" } }).ok).toBe(true);
    expect(parseBrandingConfig({ share: { twitterHandle: "not a handle" } }).ok).toBe(false);
  });

  it("validates the seller email and website", () => {
    expect(parseBrandingConfig({ invoice: { sellerEmail: "billing@acme.com", sellerWebsite: "https://acme.com" } }).ok).toBe(true);
    expect(parseBrandingConfig({ invoice: { sellerEmail: "nope" } }).ok).toBe(false);
    expect(parseBrandingConfig({ invoice: { sellerWebsite: "acme.com" } }).ok).toBe(false);
    expect(parseBrandingConfig({ invoice: { sellerName: "" } }).ok).toBe(false);
  });
});

describe("parsing", () => {
  it("fills partial imports from the defaults and falls back for garbage", () => {
    const r = parseBrandingConfig({ credits: { copyright: "© Acme" } });
    expect(r.ok && r.config.credits.copyright).toBe("© Acme");
    expect(r.ok && r.config.credits.disclaimer.length).toBeGreaterThan(10);
    for (const bad of [null, undefined, 3, "x", [], { tags: "no" }]) expect(normalizeBrandingConfig(bad)).toEqual(DEFAULT_BRANDING_CONFIG);
  });

  it("rejects an unsafe social link and duplicate ids", () => {
    const s = { id: "s1", icon: "x", label: "X", href: "javascript:alert(1)", enabled: true };
    expect(parseBrandingConfig({ social: [s] }).ok).toBe(false);
    const good = { ...s, href: "https://x.com/acme" };
    expect(parseBrandingConfig({ social: [good, good] }).ok).toBe(false);
  });
});

describe("public stats", () => {
  const stats = (patch: Partial<BrandingConfig["stats"]> = {}): BrandingConfig["stats"] => ({ ...DEFAULT_BRANDING_CONFIG.stats, enabled: true, ...patch });

  it("formats compact numbers by rounding down, so a counter never overstates", () => {
    expect([0, 999, 1000, 1234, 1999, 12_500, 999_999, 2_300_000, 5_000_000_000].map(formatStatValue)).toEqual(["0", "999", "1K", "1.2K", "1.9K", "12.5K", "999.9K", "2.3M", "5B"]);
  });

  it("shows nothing when the strip is off", () => {
    expect(resolveStats({ ...stats(), enabled: false }, { users: 5000 })).toBeNull();
  });

  it("uses real counts, with the admin's suffix", () => {
    const r = resolveStats(stats(), { users: 1500, posts_published: 12_000, platforms: 10, channels: 800 });
    expect(r?.items.map((i) => [i.label, i.value])).toEqual([
      ["Creators and teams", "1.5K+"],
      ["Posts published", "12K+"],
      ["Platforms supported", "10"],
      ["Accounts connected", "800+"],
    ]);
  });

  it("hides a stat whose number is missing, zero, or under the minimum", () => {
    const items = stats().items.map((i) => (i.source === "users" ? { ...i, minimum: 1000 } : i));
    const r = resolveStats(stats({ items }), { users: 40, posts_published: 0, platforms: 10 });
    expect(r?.items.map((i) => i.id)).toEqual(["st-platforms"]);
  });

  it("drops the whole strip when nothing is left, and shows manual values as typed", () => {
    expect(resolveStats(stats(), {})).toBeNull();
    const manual = [
      { id: "m1", label: "Uptime", source: "manual" as const, manualValue: "99.9%", suffix: "", minimum: 0, enabled: true },
      { id: "m2", label: "Empty", source: "manual" as const, manualValue: "  ", suffix: "", minimum: 0, enabled: true },
    ];
    expect(resolveStats(stats({ items: manual }), {})?.items).toEqual([{ id: "m1", label: "Uptime", value: "99.9%" }]);
  });
});
