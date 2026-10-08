import { describe, it, expect } from "vitest";
import { applyShareImage, shareImages, twitterSite } from "./metadata";
import { DEFAULT_BRANDING_CONFIG } from "./config";

const share = DEFAULT_BRANDING_CONFIG.share;

describe("share image helpers", () => {
  it("uses the admin's image, falling back to the logo", () => {
    expect(shareImages(share)).toEqual([{ url: "/brand/og-image.png", alt: "MultiPost Studio" }]);
    expect(shareImages({ ...share, imageUrl: "https://cdn.example.com/og.png", imageAlt: "Cover" })).toEqual([{ url: "https://cdn.example.com/og.png", alt: "Cover" }]);
  });

  it("normalises the handle", () => {
    expect(twitterSite(share)).toBeUndefined();
    expect(twitterSite({ ...share, twitterHandle: "brand" })).toBe("@brand");
    expect(twitterSite({ ...share, twitterHandle: "@brand" })).toBe("@brand");
  });
});

describe("applyShareImage", () => {
  const custom = { ...share, imageUrl: "https://cdn.example.com/og.png", twitterHandle: "@brand" };

  it("restores the image on a page that overrides openGraph and twitter without one", () => {
    const out = applyShareImage({ title: "Home", openGraph: { title: "Home" }, twitter: { card: "summary_large_image" } }, custom);
    expect(out.openGraph?.images).toEqual([{ url: "https://cdn.example.com/og.png", alt: "MultiPost Studio" }]);
    expect(out.twitter?.images).toEqual([{ url: "https://cdn.example.com/og.png", alt: "MultiPost Studio" }]);
    expect(out.twitter?.site).toBe("@brand");
    expect(out.twitter && "card" in out.twitter && out.twitter.card).toBe("summary_large_image");
  });

  it("never overrides an image the page chose itself", () => {
    const own = [{ url: "https://example.com/post.png" }];
    const out = applyShareImage({ openGraph: { images: own }, twitter: { images: ["https://example.com/post.png"] } }, custom);
    expect(out.openGraph?.images).toBe(own);
    expect(out.twitter?.images).toEqual(["https://example.com/post.png"]);
  });

  it("leaves a page with no openGraph or twitter alone, since the site-wide ones apply", () => {
    const out = applyShareImage({ title: "Plain" }, custom);
    expect(out.openGraph).toBeUndefined();
    expect(out.twitter).toBeUndefined();
  });
});
