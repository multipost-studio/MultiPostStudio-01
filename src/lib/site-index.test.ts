import { describe, it, expect } from "vitest";
import { FREE_TOOLS, buildSiteIndex } from "./site-index";
import { dedupeRoutes, type SitemapRoute } from "./sitemap-routes";

const index = buildSiteIndex({
  features: { publishing: { name: "Publishing" } },
  solutions: { creators: { name: "Creators" } },
  customers: [{ slug: "agency-workflow", name: "Multi-Client Agency Operations" }],
  guides: [{ slug: "content-pillars", title: "Content pillars" }],
  platforms: [{ slug: "instagram", key: "instagram" }, { slug: "gbp", key: "gbp" }],
  comparisons: [{ slug: "buffer", competitor: "Buffer" }],
});

describe("buildSiteIndex", () => {
  it("opens every list with its overview page, then one link per item", () => {
    expect(index.features.map((l) => l.href)).toEqual(["/features", "/features/publishing"]);
    expect(index.solutions.map((l) => l.href)).toEqual(["/solutions", "/solutions/creators"]);
    expect(index.usecases.map((l) => l.href)).toEqual(["/customers", "/customers/agency-workflow"]);
    expect(index.guides.map((l) => l.href)).toEqual(["/guides", "/guides/content-pillars"]);
  });

  it("labels platforms with their real names and comparisons as 'vs …'", () => {
    expect(index.platforms.map((l) => l.label)).toEqual(["All platforms", "Instagram", "Google Business"]);
    expect(index.compare.map((l) => [l.label, l.href])).toEqual([
      ["All comparisons", "/comparisons"],
      ["vs Buffer", "/comparisons/buffer"],
    ]);
  });

  it("lists every free tool, each under /tools", () => {
    expect(index.tools[0].href).toBe("/tools");
    expect(index.tools.slice(1)).toEqual(FREE_TOOLS);
    for (const t of FREE_TOOLS) expect(t.href.startsWith("/tools/")).toBe(true);
  });

  it("never produces a duplicate or an external href", () => {
    const all = Object.values(index).flat().map((l) => l.href);
    expect(all.every((h) => h.startsWith("/"))).toBe(true);
    for (const list of Object.values(index)) expect(new Set(list.map((l) => l.href)).size).toBe(list.length);
  });
});

describe("dedupeRoutes", () => {
  const r = (path: string, priority: number): SitemapRoute => ({ path, priority, changeFrequency: "weekly" });

  it("keeps one entry per page, in first-seen order, with the highest priority", () => {
    const out = dedupeRoutes([r("/a", 0.3), r("/b", 0.5), r("/a", 0.9), r("/b", 0.1)]);
    expect(out.map((x) => [x.path, x.priority])).toEqual([["/a", 0.9], ["/b", 0.5]]);
  });

  it("treats a trailing slash as the same page, but leaves the home path alone", () => {
    const out = dedupeRoutes([r("/about", 0.6), r("/about/", 0.6), r("/", 1), r("", 1)]);
    expect(out.map((x) => x.path)).toEqual(["/about", "/", ""]);
  });
});
