import { describe, it, expect } from "vitest";
import { ADMIN_NAV } from "./nav";
import { activeHref, filterNav, groupNav } from "./admin-nav";

describe("groupNav", () => {
  it("keeps Overview untitled and groups the rest in order", () => {
    const g = groupNav(ADMIN_NAV);
    expect(g[0]).toMatchObject({ title: null });
    expect(g[0].items.map((i) => i.href)).toEqual(["/admin"]);
    expect(g.map((x) => x.title).slice(1, 3)).toEqual(["Marketing", "People & orgs"]);
    expect(g.flatMap((x) => x.items)).toHaveLength(ADMIN_NAV.length);
  });
});

describe("activeHref", () => {
  it("picks exactly one item, the most specific", () => {
    expect(activeHref(ADMIN_NAV, "/admin/marketing/links")).toBe("/admin/marketing/links");
    expect(activeHref(ADMIN_NAV, "/admin/marketing")).toBe("/admin/marketing");
    expect(activeHref(ADMIN_NAV, "/admin/blog/categories")).toBe("/admin/blog/categories");
    expect(activeHref(ADMIN_NAV, "/admin/blog/some-post-id")).toBe("/admin/blog");
  });

  it("only highlights Overview on /admin itself", () => {
    expect(activeHref(ADMIN_NAV, "/admin")).toBe("/admin");
    expect(activeHref(ADMIN_NAV, "/admin/unknown-page")).toBeNull();
  });

  it("does not match on a shared prefix that is not a path boundary", () => {
    expect(activeHref([{ label: "Users", href: "/admin/users", icon: "x" }], "/admin/users-archive")).toBeNull();
  });
});

describe("filterNav", () => {
  it("returns everything for an empty query", () => {
    expect(filterNav(ADMIN_NAV, "  ")).toHaveLength(ADMIN_NAV.length);
  });

  it("ranks label prefixes first, then words, then group matches", () => {
    const r = filterNav(ADMIN_NAV, "aud").map((i) => i.label);
    expect(r[0]).toBe("Audiences");
    const byGroup = filterNav(ADMIN_NAV, "revenue").map((i) => i.label);
    expect(byGroup).toEqual(expect.arrayContaining(["Plans", "Billing"]));
  });

  it("matches inside words and ignores case", () => {
    expect(filterNav(ADMIN_NAV, "PROMO").map((i) => i.label)).toContain("Promo Cards");
    expect(filterNav(ADMIN_NAV, "zzzz")).toEqual([]);
  });
});

describe("ADMIN_NAV integrity", () => {
  it("has unique hrefs and labels", () => {
    expect(new Set(ADMIN_NAV.map((i) => i.href)).size).toBe(ADMIN_NAV.length);
    expect(new Set(ADMIN_NAV.map((i) => i.label)).size).toBe(ADMIN_NAV.length);
  });

  it("exposes the marketing tools", () => {
    const hrefs = ADMIN_NAV.map((i) => i.href);
    for (const h of ["/admin/marketing", "/admin/marketing/links", "/admin/marketing/audiences", "/admin/promo-cards", "/admin/broadcast"]) expect(hrefs).toContain(h);
  });
});
