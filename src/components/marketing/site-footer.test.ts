import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteFooter } from "./site-footer";
import { DEFAULT_FOOTER_CONFIG, type FooterConfig } from "@/lib/footer/config";
import { resolveFooter, type NavLists } from "@/lib/footer/resolve";
import { DEFAULT_BRANDING_CONFIG, type BrandingConfig } from "@/lib/branding/config";

const nav: NavLists = {
  product: [{ label: "Overview", href: "/features" }],
  solution: [{ label: "Creators", href: "/solutions/creators" }],
  resource: [{ label: "Blog", href: "/blog" }],
  company: [{ label: "About", href: "/about" }],
  legal: [{ label: "Privacy", href: "/legal/privacy" }],
  features: [{ label: "All features", href: "/features" }],
  usecases: [{ label: "All use cases", href: "/customers" }, { label: "Agency workflow", href: "/customers/agency-workflow" }],
  platforms: [{ label: "All platforms", href: "/platforms" }, { label: "Instagram", href: "/platforms/instagram" }],
  compare: [{ label: "All comparisons", href: "/comparisons" }, { label: "vs Buffer", href: "/comparisons/buffer" }],
  tools: [{ label: "Caption generator", href: "/tools/caption-generator" }],
  guides: [{ label: "All guides", href: "/guides" }],
};

const html = (config: FooterConfig, appUrl?: string, branding: BrandingConfig = DEFAULT_BRANDING_CONFIG) =>
  renderToStaticMarkup(createElement(SiteFooter, { model: resolveFooter(config, nav, branding, new Date("2031-01-01T00:00:00Z")), appUrl }));

describe("SiteFooter", () => {
  it("renders every default column heading, its links and the year", () => {
    const out = html(DEFAULT_FOOTER_CONFIG);
    for (const t of ["Product", "Solutions", "Resources", "Company", "Legal"]) expect(out).toContain(t);
    for (const href of ["/features", "/pricing", "/blog", "/customers", "/legal/privacy", "/legal/affiliate-terms"]) expect(out).toContain(`href="${href}"`);
    expect(out).toContain("© 2031 MultiPost Studio.");
  });

  it("draws social icons as accessible links with an svg glyph", () => {
    const out = html(DEFAULT_FOOTER_CONFIG, undefined, {
      ...DEFAULT_BRANDING_CONFIG,
      social: [
        { id: "s1", icon: "instagram", label: "Instagram", href: "https://instagram.com/acme", enabled: true },
        { id: "s2", icon: "linkedin", label: "LinkedIn", href: "https://linkedin.com/company/acme", enabled: true },
        { id: "s3", icon: "email", label: "Email us", href: "mailto:hi@acme.com", enabled: true },
      ],
    });
    expect(out).toContain('href="https://instagram.com/acme"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain("Instagram</span>");
    expect(out).toContain("LinkedIn</span>");
    expect(out).toContain('href="mailto:hi@acme.com"');
    expect(out).toMatch(/<svg[^>]*viewBox="0 0 24 24"[^>]*><path d="M/);
  });

  it("opens outside links in a new tab and keeps site links in the app", () => {
    const out = html({ ...DEFAULT_FOOTER_CONFIG, apps: { title: "Apps", items: [{ id: "a", label: "Docs", description: "", href: "https://docs.acme.com", icon: "docs", newTab: false, enabled: true }] } });
    expect(out).toMatch(/<a href="https:\/\/docs\.acme\.com"[^>]*target="_blank"/);
    expect(out).not.toMatch(/<a href="\/pricing"[^>]*target=/);
  });

  it("shows extra credit lines, linked when they have an address", () => {
    const out = html(DEFAULT_FOOTER_CONFIG, undefined, {
      ...DEFAULT_BRANDING_CONFIG,
      credits: { ...DEFAULT_BRANDING_CONFIG.credits, lines: [{ id: "c1", text: "Designed by Studio", href: "https://studio.example.com", enabled: true }, { id: "c2", text: "Made in India", href: "", enabled: true }] },
    });
    expect(out).toContain('href="https://studio.example.com"');
    expect(out).toContain("Designed by Studio");
    expect(out).toContain("Made in India");
  });

  it("renders a Built-by row with the name and link only once a name is set", () => {
    expect(html(DEFAULT_FOOTER_CONFIG)).not.toContain("Built by");
    const out = html(DEFAULT_FOOTER_CONFIG, undefined, {
      ...DEFAULT_BRANDING_CONFIG,
      credits: { ...DEFAULT_BRANDING_CONFIG.credits, builtBy: { enabled: true, label: "Built by", name: "Acme Studio", href: "https://acme.example.com" } },
    });
    expect(out).toContain("Built by");
    expect(out).toContain("Acme Studio");
    expect(out).toContain('href="https://acme.example.com"');
  });

  it("includes every column of links, including the platforms, comparisons and use cases lists", () => {
    const out = html(DEFAULT_FOOTER_CONFIG);
    for (const t of ["Use cases", "Platforms", "Compare"]) expect(out).toContain(t);
    for (const href of ["/platforms/instagram", "/comparisons/buffer", "/customers/agency-workflow", "/sitemap"]) expect(out).toContain(`href="${href}"`);
  });

  it("points the default Web app card at this deployment's app URL", () => {
    expect(html(DEFAULT_FOOTER_CONFIG, "https://app.example.test")).toContain('href="https://app.example.test"');
  });

  it("shows contact details only when given, and the wordmark only when on", () => {
    const bare = html({ ...DEFAULT_FOOTER_CONFIG, wordmark: { ...DEFAULT_FOOTER_CONFIG.wordmark, enabled: false } });
    expect(bare).not.toContain("mailto:");
    expect(bare).not.toContain("tracking-[-0.045em]");
    const full = html({ ...DEFAULT_FOOTER_CONFIG, contact: { email: "hi@acme.com", phone: "+91 98765 43210", address: "1 Main St\nGoa" } });
    expect(full).toContain('href="mailto:hi@acme.com"');
    expect(full).toContain('href="tel:+919876543210"');
    expect(full).toContain("1 Main St");
    expect(full).toContain("tracking-[-0.045em]");
  });
});
