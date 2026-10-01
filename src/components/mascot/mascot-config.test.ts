import { describe, it, expect } from "vitest";
import { matchRouteMessage } from "./mascot-config";

describe("matchRouteMessage", () => {
  it("resolves every nav module to a real, non-empty explanation", () => {
    const routes = [
      "/dashboard",
      "/ideas",
      "/studio",
      "/templates",
      "/composer",
      "/composer/new",
      "/composer/grid",
      "/calendar",
      "/queue",
      "/inbox",
      "/comments",
      "/analytics",
      "/analytics/content",
      "/analytics/audience",
      "/analytics/youtube",
      "/campaigns",
      "/reports",
      "/insights",
      "/trends",
      "/competitors",
      "/opportunities",
      "/media",
      "/automations",
      "/recycling",
      "/team",
      "/approvals",
      "/integrations",
      "/affiliate",
      "/agency",
      "/settings",
    ];
    for (const route of routes) {
      const msg = matchRouteMessage(route);
      expect(msg, `no contextual message for ${route}`).not.toBeNull();
      expect(msg!.title.length, `empty title for ${route}`).toBeGreaterThan(0);
      expect(msg!.body?.length ?? 0, `${route} has a title but no explanatory body`).toBeGreaterThan(0);
    }
  });

  it("longest-prefix wins — /analytics/youtube gets its own message, not the generic /analytics one", () => {
    const generic = matchRouteMessage("/analytics");
    const youtube = matchRouteMessage("/analytics/youtube");
    const content = matchRouteMessage("/analytics/content");
    const audience = matchRouteMessage("/analytics/audience");
    expect(youtube?.title).not.toBe(generic?.title);
    expect(content?.title).not.toBe(generic?.title);
    expect(audience?.title).not.toBe(generic?.title);
  });

  it("an unknown route resolves to null, not a crash", () => {
    expect(matchRouteMessage("/some/unknown/route")).toBeNull();
  });
});
