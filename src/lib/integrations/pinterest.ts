import { env } from "@/lib/env";

/**
 * Pinterest API v5 client and payload builders. Written from Pinterest's documented API and covered by unit tests with the
 * network mocked; it has not been run against a live Pinterest app, so try it with PINTEREST_SANDBOX=true (or a test
 * account) first. Pure functions are separated from the fetch calls so the request shapes can be tested exactly.
 */
export const PIN_TITLE_MAX = 100;
export const PIN_DESCRIPTION_MAX = 800;
export const PIN_ALT_MAX = 500;
export const PIN_LINK_MAX = 2048;
export const PIN_BOARD_NAME_MAX = 50;
export const CAROUSEL_MIN = 2;
export const CAROUSEL_MAX = 5;
/** Largest video we will pull into memory and upload in one request (the rest of the publish must fit a serverless run). */
export const VIDEO_MAX_BYTES = 128 * 1024 * 1024;

export function pinterestApiBase(): string {
  return env.PINTEREST_SANDBOX === "true" ? "https://api-sandbox.pinterest.com/v5" : "https://api.pinterest.com/v5";
}

export class PinterestApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: number | null,
    public readonly detail: string,
    where: string,
  ) {
    super(`Pinterest ${where} ${status}${code != null ? ` (code ${code})` : ""}: ${detail.slice(0, 300)}`);
    this.name = "PinterestApiError";
  }
}

async function call<T>(token: string, where: string, path: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<T> {
  const res = await fetch(`${pinterestApiBase()}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.body ? { "content-type": "application/json" } : {}), ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) {
    let code: number | null = null;
    let detail = text;
    try {
      const j = JSON.parse(text) as { code?: unknown; message?: unknown };
      if (typeof j.code === "number") code = j.code;
      if (typeof j.message === "string") detail = j.message;
    } catch {
      /* not JSON: keep the text */
    }
    throw new PinterestApiError(res.status, code, detail, where);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

/* ------------------------------ boards ------------------------------ */

export type PinterestBoard = { id: string; name: string; description: string; privacy: "PUBLIC" | "PROTECTED" | "SECRET"; pinCount: number };

/** Parse one board from an API item; anything without an id and a name is skipped. */
export function parseBoard(raw: unknown): PinterestBoard | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.id !== "string" || !b.id || typeof b.name !== "string" || !b.name) return null;
  const privacy = b.privacy === "SECRET" || b.privacy === "PROTECTED" ? b.privacy : "PUBLIC";
  return { id: b.id, name: b.name.slice(0, 200), description: typeof b.description === "string" ? b.description.slice(0, 500) : "", privacy, pinCount: typeof b.pin_count === "number" ? b.pin_count : 0 };
}

/** All of an account's boards (up to `max`), following Pinterest's bookmark pagination. */
export async function listBoards(token: string, max = 250): Promise<PinterestBoard[]> {
  const boards: PinterestBoard[] = [];
  let bookmark: string | undefined;
  for (let page = 0; page < 5 && boards.length < max; page++) {
    const res = await call<{ items?: unknown[]; bookmark?: string | null }>(token, "boards", `/boards?page_size=100${bookmark ? `&bookmark=${encodeURIComponent(bookmark)}` : ""}`);
    for (const it of res.items ?? []) {
      const b = parseBoard(it);
      if (b) boards.push(b);
    }
    bookmark = res.bookmark ?? undefined;
    if (!bookmark) break;
  }
  return boards.slice(0, max);
}

export async function createBoard(token: string, args: { name: string; description?: string; privacy?: "PUBLIC" | "SECRET" }): Promise<PinterestBoard> {
  const res = await call<unknown>(token, "create board", "/boards", { method: "POST", body: JSON.stringify({ name: args.name, ...(args.description ? { description: args.description } : {}), privacy: args.privacy ?? "PUBLIC" }) });
  const board = parseBoard(res);
  if (!board) throw new Error("Pinterest didn't return the new board");
  return board;
}

export type BoardNameCheck = { ok: true; name: string } | { ok: false; error: string };

/** Pinterest board names: 1 to 50 characters. */
export function checkBoardName(input: unknown): BoardNameCheck {
  const name = typeof input === "string" ? input.replace(/\s+/g, " ").trim() : "";
  if (!name) return { ok: false, error: "Give the board a name" };
  if (name.length > PIN_BOARD_NAME_MAX) return { ok: false, error: `Board names can be up to ${PIN_BOARD_NAME_MAX} characters` };
  return { ok: true, name };
}

/* ---------------------------- pin payloads ---------------------------- */

/** A destination link must be an https URL; anything else (javascript:, http:, data:) is dropped rather than sent. */
export function safePinLink(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || t.length > PIN_LINK_MAX) return null;
  try {
    const u = new URL(t);
    return u.protocol === "https:" && u.hostname.includes(".") ? u.toString() : null;
  } catch {
    return null;
  }
}

/** The channel-level options a person can set on a Pinterest post (stored in PostChannel.metadata). */
export type PinOptions = { boardId?: string; link?: string; title?: string };

export function parsePinOptions(raw: string | null | undefined): PinOptions {
  if (!raw) return {};
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const out: PinOptions = {};
    if (typeof j.boardId === "string" && /^[0-9]{1,30}$/.test(j.boardId.trim())) out.boardId = j.boardId.trim();
    const link = safePinLink(j.link);
    if (link) out.link = link;
    if (typeof j.title === "string" && j.title.trim()) out.title = j.title.trim().slice(0, PIN_TITLE_MAX);
    return out;
  } catch {
    return {};
  }
}

/** First line is the title (unless one was set), the whole text is the description. */
export function splitTitleDescription(body: string, titleOverride?: string): { title: string; description: string } {
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const title = (titleOverride?.trim() || lines[0] || "New Pin").slice(0, PIN_TITLE_MAX);
  return { title, description: body.trim().slice(0, PIN_DESCRIPTION_MAX) };
}

export type PinMedia = { url: string; altText?: string };
export type PinPayloadArgs = { boardId: string; body: string; options: PinOptions; images: PinMedia[] } | { boardId: string; body: string; options: PinOptions; videoMediaId: string; coverUrl?: string };

/** The JSON body for POST /pins: one image, a carousel of 2 to 5 images, or an uploaded video. */
export function buildPinPayload(args: PinPayloadArgs): Record<string, unknown> {
  const { title, description } = splitTitleDescription(args.body, args.options.title);
  const base: Record<string, unknown> = { board_id: args.boardId, title, description, ...(args.options.link ? { link: args.options.link } : {}) };
  if ("videoMediaId" in args) {
    return { ...base, media_source: { source_type: "video_id", media_id: args.videoMediaId, ...(args.coverUrl ? { cover_image_url: args.coverUrl } : { cover_image_key_frame_time: 0 }) } };
  }
  const images = args.images;
  if (images.length === 0) throw new Error("Pinterest publishing requires an image attachment");
  if (images.length === 1) {
    const alt = images[0].altText?.trim();
    return { ...base, ...(alt ? { alt_text: alt.slice(0, PIN_ALT_MAX) } : {}), media_source: { source_type: "image_url", url: images[0].url } };
  }
  if (images.length < CAROUSEL_MIN || images.length > CAROUSEL_MAX) throw new Error(`A Pinterest carousel needs ${CAROUSEL_MIN} to ${CAROUSEL_MAX} images`);
  return {
    ...base,
    media_source: {
      source_type: "multiple_image_urls",
      items: images.map((im) => ({ url: im.url, ...(args.options.link ? { link: args.options.link } : {}), ...(im.altText?.trim() ? { description: im.altText.trim().slice(0, PIN_ALT_MAX) } : {}) })),
    },
  };
}

export async function createPin(token: string, payload: Record<string, unknown>): Promise<{ id: string }> {
  const res = await call<{ id?: string }>(token, "pin", "/pins", { method: "POST", body: JSON.stringify(payload) }, 45_000);
  if (!res.id) throw new Error("Pinterest didn't return a pin id");
  return { id: res.id };
}

/* ------------------------------ video ------------------------------ */

export type MediaRegistration = { mediaId: string; uploadUrl: string; fields: Record<string, string> };

export function parseMediaRegistration(raw: unknown): MediaRegistration | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const mediaId = typeof r.media_id === "string" ? r.media_id : typeof r.media_id === "number" ? String(r.media_id) : null;
  const uploadUrl = typeof r.upload_url === "string" ? r.upload_url : null;
  const p = r.upload_parameters;
  if (!mediaId || !uploadUrl || !p || typeof p !== "object") return null;
  // The upload goes to a storage URL Pinterest hands us: it must be https, never a path on some other scheme.
  try {
    if (new URL(uploadUrl).protocol !== "https:") return null;
  } catch {
    return null;
  }
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(p as Record<string, unknown>)) if (typeof v === "string") fields[k] = v;
  return { mediaId, uploadUrl, fields };
}

export type MediaStatus = "registered" | "processing" | "succeeded" | "failed" | "unknown";
export function parseMediaStatus(raw: unknown): MediaStatus {
  const s = raw && typeof raw === "object" ? (raw as Record<string, unknown>).status : null;
  return s === "registered" || s === "processing" || s === "succeeded" || s === "failed" ? s : "unknown";
}

export async function registerVideoUpload(token: string): Promise<MediaRegistration> {
  const reg = parseMediaRegistration(await call<unknown>(token, "media", "/media", { method: "POST", body: JSON.stringify({ media_type: "video" }) }));
  if (!reg) throw new Error("Pinterest didn't return a usable upload target for the video");
  return reg;
}

/** Send the file to the storage target: the parameters first, the file last, as Pinterest's upload form requires. */
export async function uploadVideoBytes(reg: MediaRegistration, bytes: Uint8Array, mimeType: string): Promise<void> {
  const form = new FormData();
  for (const [k, v] of Object.entries(reg.fields)) form.append(k, v);
  form.append("file", new Blob([bytes as unknown as BlobPart], { type: mimeType || "video/mp4" }), "video.mp4");
  const res = await fetch(reg.uploadUrl, { method: "POST", body: form, signal: AbortSignal.timeout(50_000) });
  if (!res.ok && res.status !== 204) throw new Error(`Pinterest video upload ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export async function getMediaStatus(token: string, mediaId: string): Promise<MediaStatus> {
  return parseMediaStatus(await call<unknown>(token, "media status", `/media/${encodeURIComponent(mediaId)}`));
}

/* ---------------------------- analytics ---------------------------- */

export type PinMetrics = { impressions: number; saves: number; pinClicks: number; outboundClicks: number; videoViews: number };

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

/**
 * Read a pin-analytics response. Pinterest groups numbers under `all`; lifetime figures are preferred, then the summary,
 * then the sum of the daily rows. Missing metrics are zero, never an error.
 */
export function parsePinAnalytics(raw: unknown): PinMetrics | null {
  const all = raw && typeof raw === "object" ? (raw as Record<string, unknown>).all : null;
  if (!all || typeof all !== "object") return null;
  const a = all as Record<string, unknown>;
  const pick = (m: Record<string, unknown>): PinMetrics => ({
    impressions: num(m.IMPRESSION),
    saves: num(m.SAVE),
    pinClicks: num(m.PIN_CLICK),
    outboundClicks: num(m.OUTBOUND_CLICK),
    videoViews: num(m.VIDEO_MRC_VIEW),
  });
  for (const key of ["lifetime_metrics", "summary_metrics"]) {
    const m = a[key];
    if (m && typeof m === "object") {
      const out = pick(m as Record<string, unknown>);
      if (out.impressions + out.saves + out.pinClicks + out.outboundClicks + out.videoViews > 0) return out;
    }
  }
  if (Array.isArray(a.daily_metrics)) {
    const sum: PinMetrics = { impressions: 0, saves: 0, pinClicks: 0, outboundClicks: 0, videoViews: 0 };
    for (const d of a.daily_metrics) {
      const m = d && typeof d === "object" ? (d as Record<string, unknown>).metrics : null;
      if (!m || typeof m !== "object") continue;
      const p = pick(m as Record<string, unknown>);
      sum.impressions += p.impressions;
      sum.saves += p.saves;
      sum.pinClicks += p.pinClicks;
      sum.outboundClicks += p.outboundClicks;
      sum.videoViews += p.videoViews;
    }
    return sum;
  }
  return { impressions: 0, saves: 0, pinClicks: 0, outboundClicks: 0, videoViews: 0 };
}

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Pinterest only answers analytics for the last 90 days; the window is clamped to that. */
export function analyticsWindow(publishedAt: Date, now: Date = new Date()): { start: string; end: string } {
  const earliest = new Date(now.getTime() - 89 * 86_400_000);
  const start = publishedAt.getTime() < earliest.getTime() ? earliest : publishedAt;
  return { start: day(start), end: day(now) };
}

export async function getPinAnalytics(token: string, pinId: string, publishedAt: Date, isVideo: boolean): Promise<PinMetrics | null> {
  const { start, end } = analyticsWindow(publishedAt);
  const ask = (metrics: string) => call<unknown>(token, "pin analytics", `/pins/${encodeURIComponent(pinId)}/analytics?start_date=${start}&end_date=${end}&metric_types=${metrics}&app_types=ALL`);
  try {
    return parsePinAnalytics(await ask(isVideo ? "IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK,VIDEO_MRC_VIEW" : "IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK"));
  } catch (err) {
    // A metric this account's pins don't support makes Pinterest refuse the whole call: fall back to the core three.
    if (err instanceof PinterestApiError && err.status === 400) return parsePinAnalytics(await ask("IMPRESSION,SAVE,PIN_CLICK"));
    throw err;
  }
}

export type PinterestAccount = { followerCount: number | null; accountType: string | null; username: string | null };

export function parseAccount(raw: unknown): PinterestAccount {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return { followerCount: typeof r.follower_count === "number" ? r.follower_count : null, accountType: typeof r.account_type === "string" ? r.account_type : null, username: typeof r.username === "string" ? r.username : null };
}

export async function getAccount(token: string): Promise<PinterestAccount> {
  return parseAccount(await call<unknown>(token, "account", "/user_account"));
}

/* ------------------------------ errors ------------------------------ */

/**
 * Add what a person can do about the failures Pinterest apps hit most. The original status line stays at the front, so retry
 * and expired-token detection (which read it) behave exactly as before.
 */
export function explainPinterestError(err: unknown): string {
  const base = err instanceof Error ? err.message : String(err);
  const detail = err instanceof PinterestApiError ? err.detail : base;
  if (err instanceof PinterestApiError) {
    if (/trial|consumer type|not allowed|upgrade|sandbox/i.test(detail) && (err.status === 403 || err.status === 401))
      return `${base} (Pinterest hasn't approved this app for full access yet, so it can only post to the sandbox or to test accounts. Apply for Standard access in the Pinterest developer portal.)`;
    if (err.status === 404 && /board/i.test(detail)) return `${base} (The board no longer exists or is not accessible. Choose another board.)`;
    if (/board/i.test(detail) && /(not found|permission|access)/i.test(detail)) return `${base} (The board is not accessible. Choose another board.)`;
    if (/image|url|link/i.test(detail) && err.status === 400) return `${base} (Pinterest couldn't use the image or link. The image must be a public JPEG, PNG or WebP and the link a working https address.)`;
  }
  return base;
}
