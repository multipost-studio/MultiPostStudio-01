import { describe, it, expect } from "vitest";
import {
  explainInstagramOptionError,
  instagramContainerParams,
  instagramOptionNotes,
  parseInstagramOptions,
  splitUsernames,
} from "./instagram-options";

const meta = (m: Record<string, string>) => JSON.stringify(m);
const reelFb = { contentType: "reel", connection: "facebook" } as const;
const reelIg = { contentType: "reel", connection: "instagram" } as const;

describe("splitUsernames", () => {
  it("accepts @, commas, spaces and mixed case, and removes repeats", () => {
    expect(splitUsernames("@Ann, ben.b  carl_c; ann")).toEqual({ valid: ["ann", "ben.b", "carl_c"], invalid: [] });
  });
  it("separates what is not a username so the form can point at it", () => {
    expect(splitUsernames("good bad!name .dot toolong" + "x".repeat(40))).toMatchObject({ valid: ["good"] });
    expect(splitUsernames("good bad!name .dot").invalid).toEqual(["bad!name", ".dot"]);
  });
});

describe("parseInstagramOptions", () => {
  it("never throws on missing or broken saved data", () => {
    for (const raw of [null, undefined, "", "not json", "[1,2]", "null", '{"igMusicId":5}']) {
      const r = parseInstagramOptions(raw, reelFb);
      expect(r.options.collaborators).toEqual([]);
      expect(r.options.music).toBeNull();
    }
  });

  it("keeps up to three collaborators and says when it cut some", () => {
    const r = parseInstagramOptions(meta({ igCollaborators: "a b c d" }), { contentType: "post", connection: "instagram" });
    expect(r.options.collaborators).toEqual(["a", "b", "c"]);
    expect(r.notes.join(" ")).toMatch(/allows 3 collaborators/);
  });

  it("drops invalid usernames with a note and never sends them", () => {
    const r = parseInstagramOptions(meta({ igCollaborators: "ok, bad!name" }), { contentType: "carousel", connection: "facebook" });
    expect(r.options.collaborators).toEqual(["ok"]);
    expect(r.notes.join(" ")).toMatch(/Not a valid Instagram username/);
  });

  it("stories take no collaborators or location", () => {
    const r = parseInstagramOptions(meta({ igCollaborators: "ann", igLocationId: "123" }), { contentType: "story", connection: "facebook" });
    expect(r.options.collaborators).toEqual([]);
    expect(r.options.locationId).toBeNull();
    expect(r.notes.length).toBe(2);
  });

  it("trial reel and share to feed only apply to Reels", () => {
    const m = meta({ igTrial: "manual", igShareToFeed: "0" });
    const post = parseInstagramOptions(m, { contentType: "post", connection: "facebook" });
    expect(post.options.trial).toBeNull();
    expect(post.options.shareToFeed).toBeUndefined();
    expect(post.notes.length).toBe(2);
    const reel = parseInstagramOptions(m, reelFb);
    expect(reel.options.trial).toBe("MANUAL");
    expect(reel.options.shareToFeed).toBe(false);
    expect(parseInstagramOptions(meta({ igTrial: "auto" }), reelIg).options.trial).toBe("SS_PERFORMANCE");
  });

  it("music works on Facebook-connected Reels only, with clamped volumes", () => {
    const m = meta({ igMusicId: "587784541076604", igMusicTitle: "Birthday Wish", igMusicVolume: "250", igVideoVolume: "0", igMusicCover: "http://insecure/x.jpg" });
    const fb = parseInstagramOptions(m, reelFb);
    expect(fb.options.music).toMatchObject({ id: "587784541076604", title: "Birthday Wish", audioVolume: 100, videoVolume: 1, cover: "" });
    const ig = parseInstagramOptions(m, reelIg);
    expect(ig.options.music).toBeNull();
    expect(ig.notes.join(" ")).toMatch(/connected through Facebook/);
    const post = parseInstagramOptions(m, { contentType: "post", connection: "facebook" });
    expect(post.options.music).toBeNull();
    expect(post.notes.join(" ")).toMatch(/only be added to Reels/);
  });

  it("refuses an id that is not numeric (nothing odd goes into a request)", () => {
    expect(parseInstagramOptions(meta({ igMusicId: "1; drop" }), reelFb).options.music).toBeNull();
    expect(parseInstagramOptions(meta({ igLocationId: "abc" }), reelFb).options.locationId).toBeNull();
  });

  it("location needs the Facebook connection", () => {
    expect(parseInstagramOptions(meta({ igLocationId: "99", igLocationName: "Cafe" }), reelFb).options).toMatchObject({ locationId: "99", locationName: "Cafe" });
    expect(parseInstagramOptions(meta({ igLocationId: "99" }), reelIg).options.locationId).toBeNull();
  });
});

describe("instagramContainerParams", () => {
  it("builds the Reel request fields Meta documents", () => {
    const { options } = parseInstagramOptions(
      meta({ igCollaborators: "ann,ben", igShareToFeed: "0", igTrial: "manual", igAi: "1", igMusicId: "55", igMusicVolume: "80", igVideoVolume: "50", igLocationId: "77" }),
      reelFb,
    );
    const p = instagramContainerParams(options, { contentType: "reel" });
    expect(p).toEqual({
      collaborators: '["ann","ben"]',
      location_id: "77",
      is_ai_generated: "true",
      share_to_feed: "false",
      trial_params: '{"graduation_strategy":"MANUAL"}',
      audio_configuration: '{"audio_id":"55","audio_volume":80,"video_volume":50}',
    });
  });

  it("a carousel gets only collaborators, location and the AI label", () => {
    const { options } = parseInstagramOptions(meta({ igCollaborators: "ann", igAi: "1", igTrial: "manual", igLocationId: "77" }), { contentType: "carousel", connection: "facebook" });
    expect(instagramContainerParams(options, { contentType: "carousel" })).toEqual({ collaborators: '["ann"]', location_id: "77", is_ai_generated: "true" });
  });

  it("nothing chosen sends nothing extra", () => {
    expect(instagramContainerParams(parseInstagramOptions(null, reelFb).options, { contentType: "reel" })).toEqual({});
  });
});

describe("messages", () => {
  it("instagramOptionNotes reports what the composer should warn about", () => {
    expect(instagramOptionNotes({ igTrial: "manual" }, { contentType: "post", connection: "facebook" })[0]).toMatch(/Reel format/);
    expect(instagramOptionNotes({}, reelFb)).toEqual([]);
  });

  it("a failed publish with music or a trial reel says what to do", () => {
    expect(explainInstagramOptionError(parseInstagramOptions(meta({ igMusicId: "5" }), reelFb).options)).toMatch(/Remove it or choose another/);
    expect(explainInstagramOptionError(parseInstagramOptions(meta({ igTrial: "manual" }), reelFb).options)).toMatch(/enough followers/);
    expect(explainInstagramOptionError(parseInstagramOptions(null, reelFb).options)).toBe("");
  });
});

describe("readMusicPreview", () => {
  it("gives the preview what it needs to play the chosen track next to the video", async () => {
    const { readMusicPreview } = await import("./instagram-options");
    expect(
      readMusicPreview(meta({ igMusicId: "55", igMusicTitle: "Birthday Wish", igMusicArtist: "Shuba", igMusicPreview: "https://cdn/a.mp4", igMusicVolume: "70", igVideoVolume: "30" })),
    ).toEqual({ title: "Birthday Wish", artist: "Shuba", url: "https://cdn/a.mp4", audioVolume: 70, videoVolume: 30 });
  });

  it("keeps only https links and valid ids, and never throws", async () => {
    const { readMusicPreview } = await import("./instagram-options");
    expect(readMusicPreview(meta({ igMusicId: "55", igMusicPreview: "http://insecure/a.mp4" }))?.url).toBe("");
    expect(readMusicPreview(meta({ igMusicId: "x" }))).toBeNull();
    expect(readMusicPreview(null)).toBeNull();
    expect(readMusicPreview("not json")).toBeNull();
  });

  it("the preview link is never part of what is sent to Instagram", () => {
    const { options } = parseInstagramOptions(meta({ igMusicId: "55", igMusicPreview: "https://cdn/a.mp4" }), reelFb);
    expect(JSON.stringify(instagramContainerParams(options, { contentType: "reel" }))).not.toContain("cdn/a.mp4");
  });
});
