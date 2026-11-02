/**
 * Instagram post options chosen in the composer (collaborators, trial reel, share to feed, AI label, music, location).
 *
 * They are saved flat, as strings, in the post channel's `metadata` (same place the Pinterest board lives), so no schema change
 * is needed. Everything here is pure: reading the saved options never throws, never trusts what was saved, and drops anything
 * Instagram would reject. A bad option is dropped and reported (see `notes`); it must never stop a post from publishing.
 *
 * Which options work depends on how the account was connected:
 *  - Instagram Login (instagram.com sign-in): collaborators, trial reel, share to feed, AI label.
 *  - Facebook Login: all of those, plus music (Instagram Audio API) and location (a Facebook Page with a location).
 */

export const IG_COLLABORATORS_MAX = 3;
export const IG_VOLUME_MIN = 1;
export const IG_VOLUME_MAX = 100;

export type IgConnection = "instagram" | "facebook";
export type IgTrialMode = "MANUAL" | "SS_PERFORMANCE";

export type IgMusic = {
  id: string;
  title: string;
  artist: string;
  cover: string;
  /** Volume of the track, 1 to 100. */
  audioVolume: number;
  /** Volume of the video's own sound, 1 to 100. */
  videoVolume: number;
};

export type InstagramOptions = {
  collaborators: string[];
  /** Reels only. Undefined = leave Instagram's default (shared to the feed). */
  shareToFeed: boolean | undefined;
  trial: IgTrialMode | null;
  aiGenerated: boolean;
  music: IgMusic | null;
  locationId: string | null;
  locationName: string;
};

export type ParsedInstagramOptions = {
  options: InstagramOptions;
  /** Plain-language reasons something saved was left out. Shown in the composer, logged at publish; never an error. */
  notes: string[];
};

export type IgContext = {
  /** The channel's publish format: post, carousel, reel or story. */
  contentType: string;
  connection: IgConnection;
};

const USERNAME = /^[a-z0-9._]{1,30}$/;
const NUMERIC_ID = /^[0-9]{1,30}$/;

export const emptyInstagramOptions = (): InstagramOptions => ({
  collaborators: [],
  shareToFeed: undefined,
  trial: null,
  aiGenerated: false,
  music: null,
  locationId: null,
  locationName: "",
});

/** "@Ann, ben.b  carl_c" -> ["ann", "ben.b", "carl_c"]. Keeps what is not a valid username, so the form can point at it. */
export function splitUsernames(raw: string): { valid: string[]; invalid: string[] } {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const part of raw.split(/[\s,;]+/)) {
    const name = part.replace(/^@+/, "").trim().toLowerCase();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    (USERNAME.test(name) && !name.startsWith(".") && !name.endsWith(".") ? valid : invalid).push(name);
  }
  return { valid, invalid };
}

function clampVolume(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return IG_VOLUME_MAX;
  return Math.min(IG_VOLUME_MAX, Math.max(IG_VOLUME_MIN, n));
}

function readFlat(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "string") out[k] = val;
    }
    return out;
  } catch {
    return {};
  }
}

const httpsUrl = (u: string | undefined): string => {
  if (!u) return "";
  try {
    return new URL(u).protocol === "https:" ? u : "";
  } catch {
    return "";
  }
};

/** Read and validate the options saved on a post channel for the given format and connection type. */
export function parseInstagramOptions(raw: string | null | undefined, ctx: IgContext): ParsedInstagramOptions {
  const m = readFlat(raw);
  const notes: string[] = [];
  const options = emptyInstagramOptions();
  const isReel = ctx.contentType === "reel";
  const isStory = ctx.contentType === "story";
  const viaFacebook = ctx.connection === "facebook";

  // Collaborators: feed posts, reels and carousels. Not stories.
  const { valid, invalid } = splitUsernames(m.igCollaborators ?? "");
  if (invalid.length) notes.push(`Not a valid Instagram username: ${invalid.map((u) => `@${u}`).join(", ")}.`);
  if (valid.length && isStory) notes.push("Collaborators can't be added to stories.");
  else options.collaborators = valid.slice(0, IG_COLLABORATORS_MAX);
  if (valid.length > IG_COLLABORATORS_MAX && !isStory) notes.push(`Instagram allows ${IG_COLLABORATORS_MAX} collaborators. Only the first ${IG_COLLABORATORS_MAX} are used.`);

  // Reel-only options.
  if (m.igShareToFeed === "0" || m.igShareToFeed === "1") {
    if (isReel) options.shareToFeed = m.igShareToFeed === "1";
    else if (m.igShareToFeed === "0") notes.push("Share to feed only applies to Reels.");
  }
  const trial = m.igTrial === "manual" ? "MANUAL" : m.igTrial === "auto" ? "SS_PERFORMANCE" : null;
  if (trial) {
    if (isReel) options.trial = trial;
    else notes.push("Trial reels need the Reel format.");
  }

  if (m.igAi === "1") options.aiGenerated = true;

  // Music: reels, Facebook-connected accounts only.
  if (m.igMusicId) {
    if (!NUMERIC_ID.test(m.igMusicId)) notes.push("The saved music track isn't valid and was left out.");
    else if (!isReel) notes.push("Music can only be added to Reels.");
    else if (!viaFacebook) notes.push("Music needs this account connected through Facebook. Reconnect it in Integrations.");
    else {
      options.music = {
        id: m.igMusicId,
        title: (m.igMusicTitle ?? "").slice(0, 200),
        artist: (m.igMusicArtist ?? "").slice(0, 200),
        cover: httpsUrl(m.igMusicCover),
        audioVolume: clampVolume(m.igMusicVolume ?? IG_VOLUME_MAX),
        videoVolume: clampVolume(m.igVideoVolume ?? IG_VOLUME_MAX),
      };
    }
  }

  // Location: a Facebook Page with a location. Not for stories; needs the Facebook connection.
  if (m.igLocationId) {
    if (!NUMERIC_ID.test(m.igLocationId)) notes.push("The saved location isn't valid and was left out.");
    else if (isStory) notes.push("Locations can't be added to stories.");
    else if (!viaFacebook) notes.push("Location needs this account connected through Facebook. Reconnect it in Integrations.");
    else {
      options.locationId = m.igLocationId;
      options.locationName = (m.igLocationName ?? "").slice(0, 200);
    }
  }

  return { options, notes };
}

/**
 * The extra fields for the container request. For a carousel these belong on the carousel container, never on its children.
 * Values are already strings, ready for a form-encoded Graph request.
 */
export function instagramContainerParams(options: InstagramOptions, ctx: Pick<IgContext, "contentType">): Record<string, string> {
  const out: Record<string, string> = {};
  const isStory = ctx.contentType === "story";
  if (options.collaborators.length && !isStory) out.collaborators = JSON.stringify(options.collaborators);
  if (options.locationId && !isStory) out.location_id = options.locationId;
  if (options.aiGenerated) out.is_ai_generated = "true";
  if (ctx.contentType === "reel") {
    if (options.shareToFeed !== undefined) out.share_to_feed = String(options.shareToFeed);
    if (options.trial) out.trial_params = JSON.stringify({ graduation_strategy: options.trial });
    if (options.music) {
      out.audio_configuration = JSON.stringify({
        audio_id: options.music.id,
        audio_volume: options.music.audioVolume,
        video_volume: options.music.videoVolume,
      });
    }
  }
  return out;
}

/** The same notes as parse, for showing under the form while the person edits. */
export function instagramOptionNotes(meta: Record<string, string>, ctx: IgContext): string[] {
  return parseInstagramOptions(JSON.stringify(meta), ctx).notes;
}

/** Explains a failed publish that used music or a trial reel, in words that say what to do. Returns "" when neither applies. */
export function explainInstagramOptionError(options: InstagramOptions): string {
  if (options.music) {
    return " The music track may no longer be available. Remove it or choose another, then schedule the post again.";
  }
  if (options.trial) {
    return " Trial reels need an account with enough followers. Publish it as a regular Reel instead, or try again later.";
  }
  return "";
}
