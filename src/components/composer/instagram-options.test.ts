import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/actions/instagram", () => ({ searchInstagramMusicAction: vi.fn(), searchInstagramLocationsAction: vi.fn() }));

import { InstagramOptions } from "./instagram-options";

const html = (props: { contentType: string; connection: "instagram" | "facebook"; meta?: Record<string, string> }) =>
  renderToStaticMarkup(createElement(InstagramOptions, { accountId: "a1", meta: {}, onChange: () => {}, ...props }));

describe("InstagramOptions panel", () => {
  it("a Facebook-connected Reel offers every option", () => {
    const h = html({ contentType: "reel", connection: "facebook" });
    for (const text of ["Collaborators", "Share to feed", "Trial reel", "Add music", "Location", "AI-generated"]) expect(h).toContain(text);
    expect(h).not.toContain("Needs a Facebook connection");
  });

  it("an Instagram-Login Reel keeps the shared options and explains how to get music and location", () => {
    const h = html({ contentType: "reel", connection: "instagram" });
    expect(h).toContain("Collaborators");
    expect(h).toContain("Trial reel");
    expect(h).not.toContain("Add music");
    // one short line per unavailable option, with a way to reconnect
    expect(h.match(/Needs a Facebook connection/g)?.length).toBe(2);
    expect(h).toContain("/integrations");
  });

  it("a post (not a Reel) has no trial reel, share to feed or music", () => {
    const h = html({ contentType: "post", connection: "facebook" });
    expect(h).toContain("Collaborators");
    expect(h).not.toContain("Trial reel");
    expect(h).not.toContain("Share to feed");
    expect(h).not.toContain("Music");
  });

  it("a story only offers the AI label", () => {
    const h = html({ contentType: "story", connection: "facebook" });
    expect(h).not.toContain("Collaborators");
    expect(h).not.toContain("Location");
    expect(h).toContain("AI-generated");
  });

  it("shows the chosen track with its volumes, and warns about a trial reel on the wrong format", () => {
    const reel = html({ contentType: "reel", connection: "facebook", meta: { igMusicId: "55", igMusicTitle: "Birthday Wish", igMusicArtist: "Shuba" } });
    expect(reel).toContain("Birthday Wish");
    expect(reel).toContain("Adjust volume");
    expect(reel).toContain("Remove music");
    const post = html({ contentType: "post", connection: "facebook", meta: { igTrial: "manual" } });
    expect(post).toContain("Trial reels need the Reel format");
  });
});
