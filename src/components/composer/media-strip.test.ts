import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MediaStrip } from "./media-strip";
import { PostPreview } from "../post-previews";

const noop = () => {};
const strip = (over: Partial<Parameters<typeof MediaStrip>[0]> = {}) =>
  renderToStaticMarkup(createElement(MediaStrip, { media: [], locked: false, uploading: false, onFiles: noop, onLibrary: noop, onRemove: noop, ...over }));

describe("MediaStrip", () => {
  it("with nothing attached, offers one obvious way to add media plus the library", () => {
    const h = strip();
    expect(h).toContain("Drag &amp; drop or");
    expect(h).toContain("select a file");
    expect(h).toContain("From library");
  });

  it("shows each attached item with a remove button, and a video badge", () => {
    const h = strip({
      media: [
        { id: "m1", url: "https://x/a.jpg", thumbUrl: null, kind: "image", filename: "a.jpg" },
        { id: "m2", url: "https://x/b.mp4", thumbUrl: "https://x/b.jpg", kind: "video", filename: "b.mp4" },
      ],
    });
    expect(h).toContain("Remove a.jpg");
    expect(h).toContain("Remove b.mp4");
    expect(h).toContain('src="https://x/b.jpg"');
  });

  it("a video with no thumbnail uses the video itself as its still frame, never an image tag pointing at a video", () => {
    const h = strip({ media: [{ id: "m", url: "https://x/b.mp4", thumbUrl: null, kind: "video", filename: "b.mp4" }] });
    expect(h).toContain("<video");
    expect(h).not.toContain('<img src="https://x/b.mp4"');
  });

  it("a locked post (already published or publishing) can't be changed", () => {
    const h = strip({ locked: true, media: [{ id: "m", url: "https://x/a.jpg", thumbUrl: null, kind: "image", filename: "a.jpg" }] });
    expect(h).not.toContain("Remove a.jpg");
    expect(h).not.toContain("select a file");
    expect(strip({ locked: true })).toContain("No media attached");
  });

  it("shows progress while uploading", () => {
    expect(strip({ uploading: true })).toContain("Uploading");
  });
});

describe("Reel preview", () => {
  const reel = (media: { url: string; fullUrl?: string; kind: string }[]) =>
    renderToStaticMarkup(createElement(PostPreview, { platform: "instagram", contentType: "reel", handle: "@x", name: "X", body: "", media }));

  it("a video has a real play button, with its thumbnail as the still frame", () => {
    const h = reel([{ url: "https://x/thumb.jpg", fullUrl: "https://x/clip.mp4", kind: "video" }]);
    expect(h).toContain('aria-label="Play video"');
    expect(h).toContain('src="https://x/thumb.jpg"');
    expect(h).not.toContain("clip.mp4"); // the file itself is only loaded once someone presses play
  });

  it("a video with no separate thumbnail shows its own first frame", () => {
    const h = reel([{ url: "https://x/clip.mp4", fullUrl: "https://x/clip.mp4", kind: "video" }]);
    expect(h).toContain("clip.mp4#t=0.1");
    expect(h).not.toContain('<img src="https://x/clip.mp4"');
  });

  it("an image gets no play button", () => {
    expect(reel([{ url: "https://x/a.jpg", kind: "image" }])).not.toContain("Play video");
  });
});
