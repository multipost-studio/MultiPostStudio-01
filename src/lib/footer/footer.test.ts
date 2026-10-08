import { describe, it, expect } from "vitest";
import { DEFAULT_FOOTER_CONFIG, isSafeHref, normalizeFooterConfig, parseFooterConfig, type FooterConfig } from "./config";
import { resolveFooter, type NavLists } from "./resolve";
import { SOCIAL_ICON_IDS, SOCIAL_ICONS } from "./icons";

const nav: NavLists = {
  product: [{ label: "Overview", href: "/features" }, { label: "Publishing", href: "/features/publishing" }],
  solution: [{ label: "Creators", href: "/solutions/creators" }],
  resource: [{ label: "Blog", href: "/blog" }],
  company: [{ label: "About", href: "/about" }],
  legal: [{ label: "Privacy", href: "/legal/privacy" }],
};
const cfg = (patch: Partial<FooterConfig> = {}): FooterConfig => ({ ...DEFAULT_FOOTER_CONFIG, ...patch });

describe("isSafeHref", () => {
  it("allows site paths, anchors, http(s), mailto and tel", () => {
    for (const ok of ["/pricing", "/legal/privacy#cookies", "#top", "https://app.example.com/x?y=1", "http://example.com", "mailto:hi@example.com", "tel:+91 98765 43210"]) {
      expect(isSafeHref(ok), ok).toBe(true);
    }
  });

  it("rejects anything that can run script or leave the site by accident", () => {
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>", "vbscript:x", "//evil.com", "ftp://x.com", "", "   ", "/with space", "https://", "mailto:nope", "/\u0000x"]) {
      expect(isSafeHref(bad), bad).toBe(false);
    }
  });
});

describe("the default footer", () => {
  it("is valid and carries every standard column", () => {
    const r = parseFooterConfig(DEFAULT_FOOTER_CONFIG);
    expect(r.ok).toBe(true);
    expect(DEFAULT_FOOTER_CONFIG.columns.map((c) => c.source)).toEqual(["product", "solution", "resource", "company", "legal"]);
  });

  it("adds the pages the old footer was missing", () => {
    const m = resolveFooter(DEFAULT_FOOTER_CONFIG, nav);
    const all = m.columns.flatMap((c) => c.links.map((l) => l.href));
    for (const href of ["/pricing", "/customers", "/legal/affiliate-terms", "/legal/data-deletion"]) expect(all).toContain(href);
  });
});

describe("resolveFooter", () => {
  it("keeps live CMS links first, then the admin's extras", () => {
    const m = resolveFooter(DEFAULT_FOOTER_CONFIG, nav);
    expect(m.columns[0].links.map((l) => l.label)).toEqual(["Overview", "Publishing", "Pricing"]);
  });

  it("hides links an admin removed, without touching the CMS", () => {
    const columns = DEFAULT_FOOTER_CONFIG.columns.map((c) => (c.source === "product" ? { ...c, hidden: ["/features/publishing"] } : c));
    expect(resolveFooter(cfg({ columns }), nav).columns[0].links.map((l) => l.href)).toEqual(["/features", "/pricing"]);
  });

  it("drops disabled columns, disabled links and columns left empty", () => {
    const columns = [
      { id: "a", title: "Off", enabled: false, source: "custom" as const, hidden: [], links: [{ id: "l", label: "L", href: "/l", newTab: false, enabled: true }] },
      { id: "b", title: "Empty", enabled: true, source: "custom" as const, hidden: [], links: [{ id: "l2", label: "L2", href: "/l2", newTab: false, enabled: false }] },
      { id: "c", title: "Mine", enabled: true, source: "custom" as const, hidden: [], links: [{ id: "l3", label: "Docs", href: "https://docs.example.com", newTab: true, enabled: true }] },
    ];
    const m = resolveFooter(cfg({ columns }), nav);
    expect(m.columns).toEqual([{ id: "c", title: "Mine", links: [{ label: "Docs", href: "https://docs.example.com", newTab: true }] }]);
  });

  it("shows a page once even if it is both a CMS link and an extra", () => {
    const columns = [{ id: "p", title: "P", enabled: true, source: "product" as const, hidden: [], links: [{ id: "d", label: "Dup", href: "/features", newTab: false, enabled: true }] }];
    expect(resolveFooter(cfg({ columns }), nav).columns[0].links).toHaveLength(2);
  });

  it("only draws enabled social icons and apps, and fills in the year", () => {
    const c = cfg({
      social: [
        { id: "s1", icon: "instagram", label: "Instagram", href: "https://instagram.com/x", enabled: true },
        { id: "s2", icon: "x", label: "X", href: "https://x.com/y", enabled: false },
      ],
      copyright: "© {year} Acme. All rights reserved. {year}",
    });
    const m = resolveFooter(c, nav, new Date("2031-06-01T00:00:00Z"));
    expect(m.social.map((s) => s.id)).toEqual(["s1"]);
    expect(m.copyright).toBe("© 2031 Acme. All rights reserved. 2031");
  });

  it("hides the wordmark and CTA when switched off", () => {
    const m = resolveFooter(cfg({ wordmark: { enabled: false, primary: "A", secondary: "B" }, cta: { ...DEFAULT_FOOTER_CONFIG.cta, enabled: false } }), nav);
    expect(m.wordmark).toBeNull();
    expect(m.cta).toBeNull();
  });
});

describe("parsing", () => {
  it("fills a partial import from the defaults", () => {
    const r = parseFooterConfig({ tagline: "Hello" });
    expect(r.ok && r.config.tagline).toBe("Hello");
    expect(r.ok && r.config.columns.length).toBe(5);
  });

  it("rejects an unsafe link anywhere, naming it", () => {
    const bad = { social: [{ id: "s1", icon: "x", label: "X", href: "javascript:alert(1)", enabled: true }] };
    const r = parseFooterConfig(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/social/);
  });

  it("rejects unknown icons, bad emails, and duplicate ids", () => {
    expect(parseFooterConfig({ social: [{ id: "s1", icon: "myspace", label: "M", href: "https://m.com", enabled: true }] }).ok).toBe(false);
    expect(parseFooterConfig({ contact: { email: "not-an-email", phone: "", address: "" } }).ok).toBe(false);
    const s = { id: "s1", icon: "x", label: "X", href: "https://x.com", enabled: true };
    expect(parseFooterConfig({ social: [s, s] }).ok).toBe(false);
  });

  it("falls back to the defaults for garbage, never throws", () => {
    for (const bad of [null, undefined, 4, "x", [], { columns: "nope" }]) expect(normalizeFooterConfig(bad)).toEqual(DEFAULT_FOOTER_CONFIG);
  });
});

describe("icons", () => {
  it("every pickable icon is defined, brand marks have a path and generic ones a kind", () => {
    for (const id of SOCIAL_ICON_IDS) {
      const d = SOCIAL_ICONS[id];
      expect(d.label.length).toBeGreaterThan(0);
      expect(Boolean(d.path) !== Boolean(d.generic), id).toBe(true);
      if (d.path) expect(d.path.length).toBeGreaterThan(40);
    }
  });
});
