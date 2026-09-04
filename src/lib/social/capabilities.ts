import type { PlatformKey } from "@/lib/constants";

/**
 * Central platform capability layer. One source of truth for:
 *   - which content types each platform supports
 *   - media rules (kinds, count, aspect ratio, video length)
 *   - character limits
 *   - whether we can actually publish that type through the connected API
 *
 * Consumed by the Composer's content-type selector, the live preview renderer,
 * client-side validation, and the publish pipeline. Do not re-derive these
 * rules anywhere else — import from here.
 */

export type ContentType =
  | "post"
  | "carousel"
  | "reel"
  | "story"
  | "short"
  | "video"
  | "photo"
  | "image"
  | "article"
  | "thread"
  | "pin"
  | "video_pin"
  | "community";

export type MediaKind = "image" | "video";

export type MediaRule = {
  kinds: MediaKind[];
  /** 0 = media optional */
  min: number;
  max: number;
  /** allowed "w:h" ratios; empty = any */
  aspectRatios: string[];
  video?: { minSec?: number; maxSec?: number; maxMB?: number };
};

export type ContentTypeSpec = {
  type: ContentType;
  label: string;
  /** caption / body / description limit */
  charLimit: number;
  media: MediaRule;
  /** "api" = we publish it for real; "unsupported" = UI + preview only */
  publish: "api" | "unsupported";
  /** shown in the UI for unsupported or partially-supported types */
  note?: string;
};

export type PlatformCapability = {
  key: PlatformKey;
  label: string;
  defaultType: ContentType;
  contentTypes: ContentTypeSpec[];
};

const AR_FEED_IG = ["1:1", "4:5", "1.91:1"];
const AR_VERTICAL = ["9:16"];

export const CAPABILITIES: Partial<Record<PlatformKey, PlatformCapability>> = {
  instagram: {
    key: "instagram",
    label: "Instagram",
    defaultType: "post",
    contentTypes: [
      {
        type: "post",
        label: "Feed Post",
        charLimit: 2200,
        publish: "api",
        media: { kinds: ["image", "video"], min: 1, max: 1, aspectRatios: AR_FEED_IG, video: { minSec: 3, maxSec: 60 } },
      },
      {
        type: "carousel",
        label: "Carousel",
        charLimit: 2200,
        publish: "api",
        media: { kinds: ["image", "video"], min: 2, max: 10, aspectRatios: ["1:1", "4:5"], video: { minSec: 3, maxSec: 60 } },
      },
      {
        type: "reel",
        label: "Reel",
        charLimit: 2200,
        publish: "api",
        media: { kinds: ["video"], min: 1, max: 1, aspectRatios: AR_VERTICAL, video: { minSec: 3, maxSec: 90 } },
      },
      {
        type: "story",
        label: "Story",
        charLimit: 2200,
        publish: "api",
        note: "Publishes via the content API. Stickers, polls and links aren't available through the API.",
        media: { kinds: ["image", "video"], min: 1, max: 1, aspectRatios: AR_VERTICAL, video: { minSec: 1, maxSec: 60 } },
      },
    ],
  },

  facebook: {
    key: "facebook",
    label: "Facebook",
    defaultType: "post",
    contentTypes: [
      {
        type: "post",
        label: "Feed Post",
        charLimit: 63206,
        publish: "api",
        media: { kinds: ["image", "video"], min: 0, max: 10, aspectRatios: [] },
      },
      {
        type: "photo",
        label: "Photo Post",
        charLimit: 63206,
        publish: "api",
        media: { kinds: ["image"], min: 1, max: 10, aspectRatios: [] },
      },
      {
        type: "video",
        label: "Video Post",
        charLimit: 63206,
        publish: "api",
        media: { kinds: ["video"], min: 1, max: 1, aspectRatios: [] },
      },
      {
        type: "reel",
        label: "Reel",
        charLimit: 63206,
        publish: "api",
        media: { kinds: ["video"], min: 1, max: 1, aspectRatios: AR_VERTICAL, video: { minSec: 3, maxSec: 90 } },
      },
      {
        type: "story",
        label: "Story",
        charLimit: 63206,
        publish: "unsupported",
        note: "Facebook Story publishing isn't available to third-party apps.",
        media: { kinds: ["image", "video"], min: 1, max: 1, aspectRatios: AR_VERTICAL },
      },
    ],
  },

  youtube: {
    key: "youtube",
    label: "YouTube",
    defaultType: "video",
    contentTypes: [
      {
        type: "video",
        label: "Video",
        charLimit: 5000,
        publish: "api",
        media: { kinds: ["video"], min: 1, max: 1, aspectRatios: ["16:9", "9:16", "4:3"], video: { maxMB: 128 } },
      },
      {
        type: "short",
        label: "Short",
        charLimit: 5000,
        publish: "api",
        note: "Uploaded as a normal video; YouTube classifies it as a Short from the vertical ratio and length (< 3 min).",
        media: { kinds: ["video"], min: 1, max: 1, aspectRatios: AR_VERTICAL, video: { maxSec: 180, maxMB: 128 } },
      },
      {
        type: "community",
        label: "Community Post",
        charLimit: 5000,
        publish: "unsupported",
        note: "YouTube has no public API for Community posts.",
        media: { kinds: ["image"], min: 0, max: 1, aspectRatios: [] },
      },
    ],
  },

  linkedin: {
    key: "linkedin",
    label: "LinkedIn",
    defaultType: "post",
    contentTypes: [
      {
        type: "post",
        label: "Post",
        charLimit: 3000,
        publish: "api",
        media: { kinds: ["image", "video"], min: 0, max: 9, aspectRatios: [] },
      },
      {
        type: "image",
        label: "Image Post",
        charLimit: 3000,
        publish: "api",
        media: { kinds: ["image"], min: 1, max: 9, aspectRatios: [] },
      },
      {
        type: "video",
        label: "Video Post",
        charLimit: 3000,
        publish: "api",
        media: { kinds: ["video"], min: 1, max: 1, aspectRatios: [] },
      },
      {
        type: "article",
        label: "Article",
        charLimit: 110000,
        publish: "unsupported",
        note: "LinkedIn's article API isn't open to third-party apps — post a link instead.",
        media: { kinds: ["image"], min: 0, max: 1, aspectRatios: [] },
      },
    ],
  },

  x: {
    key: "x",
    label: "X",
    defaultType: "post",
    contentTypes: [
      {
        type: "post",
        label: "Post",
        charLimit: 280,
        publish: "api",
        note: "Writing to X needs a paid X API tier on the connected app.",
        media: { kinds: ["image", "video"], min: 0, max: 4, aspectRatios: [] },
      },
      {
        type: "thread",
        label: "Thread",
        charLimit: 280,
        publish: "api",
        note: "Each blank-line-separated block becomes one post. Needs a paid X API tier.",
        media: { kinds: ["image", "video"], min: 0, max: 4, aspectRatios: [] },
      },
    ],
  },

  threads: {
    key: "threads",
    label: "Threads",
    defaultType: "post",
    contentTypes: [
      {
        type: "post",
        label: "Post",
        charLimit: 500,
        publish: "api",
        media: { kinds: ["image", "video"], min: 0, max: 1, aspectRatios: [] },
      },
    ],
  },

  bluesky: {
    key: "bluesky",
    label: "Bluesky",
    defaultType: "post",
    contentTypes: [
      {
        type: "post",
        label: "Post",
        charLimit: 300,
        publish: "api",
        media: { kinds: ["image"], min: 0, max: 4, aspectRatios: [] },
      },
    ],
  },

  tiktok: {
    key: "tiktok",
    label: "TikTok",
    defaultType: "video",
    contentTypes: [
      {
        type: "video",
        label: "Video",
        charLimit: 2200,
        publish: "unsupported",
        note: "TikTok publishing isn't wired — no OAuth app configured.",
        media: { kinds: ["video"], min: 1, max: 1, aspectRatios: AR_VERTICAL },
      },
    ],
  },

  pinterest: {
    key: "pinterest",
    label: "Pinterest",
    defaultType: "pin",
    contentTypes: [
      {
        type: "pin",
        label: "Pin",
        charLimit: 500,
        publish: "unsupported",
        note: "Pinterest publishing isn't wired yet.",
        media: { kinds: ["image"], min: 1, max: 1, aspectRatios: ["2:3", "1:1"] },
      },
      {
        type: "video_pin",
        label: "Video Pin",
        charLimit: 500,
        publish: "unsupported",
        note: "Pinterest publishing isn't wired yet.",
        media: { kinds: ["video"], min: 1, max: 1, aspectRatios: ["2:3", "9:16"] },
      },
    ],
  },

  gbp: {
    key: "gbp",
    label: "Google Business",
    defaultType: "post",
    contentTypes: [
      {
        type: "post",
        label: "Update",
        charLimit: 1500,
        publish: "unsupported",
        note: "Google Business Profile publishing isn't wired yet.",
        media: { kinds: ["image"], min: 0, max: 1, aspectRatios: [] },
      },
    ],
  },
};

export function platformCapability(platform: string): PlatformCapability | undefined {
  return CAPABILITIES[platform as PlatformKey];
}

export function contentTypesFor(platform: string): ContentTypeSpec[] {
  return platformCapability(platform)?.contentTypes ?? [];
}

export function defaultContentType(platform: string): ContentType {
  return platformCapability(platform)?.defaultType ?? "post";
}

export function contentSpec(platform: string, type: string): ContentTypeSpec | undefined {
  const caps = platformCapability(platform);
  if (!caps) return undefined;
  return caps.contentTypes.find((c) => c.type === type) ?? caps.contentTypes.find((c) => c.type === caps.defaultType);
}

/** True when the platform + content type can actually be published for real. */
export function canPublishType(platform: string, type: string): boolean {
  return contentSpec(platform, type)?.publish === "api";
}

/* ---------------- validation ---------------- */

export type MediaInput = {
  kind: string; // "image" | "video" | "document"
  mimeType: string;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
};

export type ValidationResult = { errors: string[]; warnings: string[] };

/** Parse "w:h" to a numeric ratio. */
function ratio(s: string): number {
  const [w, h] = s.split(":").map(Number);
  return h ? w / h : 0;
}

/** Split a thread body into its posts (blank line or a lone "---" separates). */
export function splitThread(body: string): string[] {
  return body
    .split(/\n\s*(?:---)?\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Validate one channel's content against its platform + content type.
 * `errors` block publishing; `warnings` are advisory (e.g. unverifiable
 * aspect ratio).
 */
export function validateChannel(
  platform: string,
  type: string,
  input: { body: string; media: MediaInput[] },
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const spec = contentSpec(platform, type);
  const label = platformCapability(platform)?.label ?? platform;

  if (!spec) {
    errors.push(`${label} doesn't support this content type.`);
    return { errors, warnings };
  }

  if (spec.publish === "unsupported") {
    errors.push(`${label} ${spec.label} can't be published from here — ${spec.note ?? "not supported."}`);
  }

  // character limit (threads: per-post)
  if (type === "thread") {
    const parts = splitThread(input.body);
    parts.forEach((p, i) => {
      if (p.length > spec.charLimit) errors.push(`Thread post ${i + 1} is ${p.length}/${spec.charLimit} characters.`);
    });
    if (parts.length === 0) errors.push("Thread is empty.");
  } else if (input.body.length > spec.charLimit) {
    errors.push(`${label} ${spec.label} allows ${spec.charLimit.toLocaleString()} characters — you have ${input.body.length.toLocaleString()}.`);
  }

  // media count + kind
  const usable = input.media.filter((m) => m.kind === "image" || m.kind === "video");
  const rule = spec.media;
  if (usable.length < rule.min) {
    errors.push(
      rule.min === 1
        ? `${label} ${spec.label} needs ${rule.kinds.join(" or ")}.`
        : `${label} ${spec.label} needs at least ${rule.min} media items.`,
    );
  }
  if (usable.length > rule.max) {
    errors.push(`${label} ${spec.label} allows at most ${rule.max} media item${rule.max === 1 ? "" : "s"} — you have ${usable.length}.`);
  }
  for (const m of usable) {
    if (!rule.kinds.includes(m.kind as MediaKind)) {
      errors.push(`${label} ${spec.label} only accepts ${rule.kinds.join(" / ")} — "${m.mimeType}" isn't allowed.`);
      break;
    }
  }

  // aspect ratio + video length
  for (const m of usable) {
    if (rule.aspectRatios.length && m.width && m.height) {
      const r = m.width / m.height;
      const ok = rule.aspectRatios.some((ar) => Math.abs(r - ratio(ar)) <= 0.06);
      if (!ok) {
        errors.push(
          `${label} ${spec.label} media should be ${rule.aspectRatios.join(" or ")} — this file is ${m.width}×${m.height}.`,
        );
      }
    } else if (rule.aspectRatios.length && m.kind === "video" && (!m.width || !m.height)) {
      warnings.push(`Couldn't read this video's dimensions — make sure it's ${rule.aspectRatios.join(" or ")}.`);
    }

    if (m.kind === "video" && rule.video) {
      const d = m.durationSec ?? 0;
      if (rule.video.maxSec && d > rule.video.maxSec) {
        errors.push(`${label} ${spec.label} video must be ${rule.video.maxSec}s or shorter — this one is ${d}s.`);
      }
      if (rule.video.minSec && d > 0 && d < rule.video.minSec) {
        errors.push(`${label} ${spec.label} video must be at least ${rule.video.minSec}s — this one is ${d}s.`);
      }
      if (!d && (rule.video.maxSec || rule.video.minSec)) {
        warnings.push("Couldn't read this video's duration — length rules can't be checked.");
      }
    }
  }

  return { errors, warnings };
}
