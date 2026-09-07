import { describe, it, expect } from "vitest";
import { validateChannel, contentSpec, canPublishPlatform, CAPABILITIES } from "./capabilities";

/**
 * LinkedIn and X publish text only — publishLinkedIn(account, text) and
 * publishX(account, text, contentType) have no media parameter at all. Before
 * this, the composer accepted attachments for them and the publisher dropped
 * them, so a post reported success with its image missing.
 *
 * These tests pin the honest behaviour: attaching media is refused up front.
 */

// MediaInput is what validateChannel takes: kind + mime + optional dimensions.
const IMAGE = { kind: "image", mimeType: "image/jpeg", width: 1080, height: 1080 };

describe("platforms whose publisher cannot send media", () => {
  for (const platform of ["linkedin", "x"] as const) {
    describe(platform, () => {
      it("publishes text with no errors", () => {
        const spec = contentSpec(platform, "post")!;
        const { errors } = validateChannel(platform, "post", { body: "Hello", media: [] });
        expect(spec.publish).toBe("api"); // text really does publish
        expect(errors).toEqual([]);
      });

      it("refuses an attachment instead of dropping it", () => {
        const { errors } = validateChannel(platform, "post", { body: "Hello", media: [IMAGE] });
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.join(" ")).toMatch(/media publishing isn't implemented/i);
      });

      it("says what to do about it", () => {
        const { errors } = validateChannel(platform, "post", { body: "Hi", media: [IMAGE] });
        expect(errors.join(" ")).toMatch(/remove the attachment/i);
      });
    });
  }

  it("marks LinkedIn's media-only content types unsupported rather than pretending", () => {
    // Image/Video posts REQUIRE media, so they cannot work at all while the
    // publisher is text-only — they must not claim publish: "api".
    for (const type of ["image", "video"] as const) {
      const spec = contentSpec("linkedin", type);
      expect(spec, `linkedin/${type} spec missing`).toBeTruthy();
      expect(spec!.publish, `linkedin/${type} must not claim real publishing`).toBe("unsupported");
      expect(spec!.note).toBeTruthy();
    }
  });

  it("does not restrict platforms whose publisher does handle media", () => {
    // Guards against the flag being applied too broadly.
    const { errors } = validateChannel("instagram", "post", { body: "Hi", media: [IMAGE] });
    expect(errors.join(" ")).not.toMatch(/media publishing isn't implemented/i);
  });

  it("every mediaUnsupported note explains the limitation", () => {
    for (const [key, cap] of Object.entries(CAPABILITIES)) {
      for (const spec of cap!.contentTypes) {
        if (spec.media.mediaUnsupported) {
          expect(spec.media.mediaUnsupported.length, `${key}/${spec.type}`).toBeGreaterThan(20);
        }
      }
    }
  });
});

describe("platforms that cannot publish at all", () => {
  it("Google Business is marked unsupported, not merely note-worthy", () => {
    // Its OAuth is real whenever Google app credentials exist, so nothing else
    // in the app would reveal that publishing is impossible.
    expect(canPublishPlatform("gbp")).toBe(false);
    for (const spec of CAPABILITIES.gbp!.contentTypes) {
      expect(spec.publish).toBe("unsupported");
      expect(spec.note).toBeTruthy();
    }
  });

  it("does not mark platforms that do publish", () => {
    for (const p of ["instagram", "facebook", "youtube", "threads", "linkedin", "x"] as const) {
      expect(canPublishPlatform(p), p).toBe(true);
    }
  });

  it("is false for an unknown platform rather than throwing", () => {
    expect(canPublishPlatform("myspace")).toBe(false);
  });
});
