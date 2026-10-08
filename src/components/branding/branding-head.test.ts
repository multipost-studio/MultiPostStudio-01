import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandingHead } from "./branding-head";
import { parseBrandingConfig } from "@/lib/branding/config";
import type { HeadTag } from "@/lib/branding/tags";

const html = (tags: HeadTag[]) => renderToStaticMarkup(createElement(BrandingHead, { tags }));

describe("BrandingHead", () => {
  it("writes verification codes as name meta tags and Open Graph keys as property", () => {
    const out = html([
      { id: "a", kind: "meta", key: "google-site-verification", content: "abc123" },
      { id: "b", kind: "meta", key: "og:site_name", content: "Acme" },
      { id: "c", kind: "link", rel: "preconnect", href: "https://fonts.example.com" },
    ]);
    expect(out).toContain('<meta name="google-site-verification" content="abc123"/>');
    expect(out).toContain('<meta property="og:site_name" content="Acme"/>');
    expect(out).toContain('<link rel="preconnect" href="https://fonts.example.com"/>');
  });

  it("escapes a value that tries to break out of the attribute", () => {
    const out = html([{ id: "a", kind: "meta", key: "x", content: '"><script>alert(1)</script>' }]);
    expect(out).not.toContain("<script>");
    expect(out).toContain("&quot;&gt;&lt;script&gt;");
  });

  it("renders nothing for no tags", () => {
    expect(html([])).toBe("");
  });
});

describe("share image validation", () => {
  it("refuses SVG, which social networks cannot display, and accepts PNG and JPG", () => {
    expect(parseBrandingConfig({ share: { imageUrl: "/media/cover-01.svg" } }).ok).toBe(false);
    expect(parseBrandingConfig({ share: { imageUrl: "https://cdn.example.com/og.svg?v=2" } }).ok).toBe(false);
    expect(parseBrandingConfig({ share: { imageUrl: "/media/Social-profile.png" } }).ok).toBe(true);
    expect(parseBrandingConfig({ share: { imageUrl: "https://cdn.example.com/og.jpg" } }).ok).toBe(true);
  });
});
