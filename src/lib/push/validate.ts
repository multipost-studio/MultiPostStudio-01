/**
 * Checking a browser's push subscription before it is stored or used. The server will POST to the endpoint in it, so the
 * endpoint is user-supplied input that must never be allowed to point anywhere but a real push service (otherwise it is a
 * way to make our server send requests to internal addresses).
 */

/** The push services browsers use: Chrome/Edge/Opera/Samsung (FCM), Firefox, Safari and iOS web apps (Apple), Windows (WNS). */
export const PUSH_HOST_SUFFIXES = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "push.services.mozilla.com",
  "push.apple.com",
  "notify.windows.com",
] as const;

export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.length > 2048) return false;
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  if (u.port && u.port !== "443") return false;
  const host = u.hostname.toLowerCase();
  return PUSH_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
}

function b64urlBytes(v: unknown): Uint8Array | null {
  if (typeof v !== "string" || v.length === 0 || v.length > 200 || !/^[A-Za-z0-9_-]+={0,2}$/.test(v)) return null;
  try {
    return Uint8Array.from(Buffer.from(v.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
  } catch {
    return null;
  }
}

export type ParsedSubscription = { endpoint: string; p256dh: string; auth: string };

/** Accepts what `PushSubscription.toJSON()` returns in the browser: { endpoint, keys: { p256dh, auth } }. */
export function parsePushSubscription(raw: unknown): { ok: true; value: ParsedSubscription } | { ok: false; error: string } {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!o) return { ok: false, error: "Invalid subscription" };
  if (!isAllowedPushEndpoint(o.endpoint)) return { ok: false, error: "That browser's push service isn't supported" };
  const keys = o.keys && typeof o.keys === "object" ? (o.keys as Record<string, unknown>) : null;
  const p256dh = b64urlBytes(keys?.p256dh);
  const auth = b64urlBytes(keys?.auth);
  // An uncompressed P-256 point is 65 bytes starting 0x04; the auth secret is 16 bytes.
  if (!p256dh || p256dh.length !== 65 || p256dh[0] !== 4 || !auth || auth.length !== 16) return { ok: false, error: "Invalid subscription keys" };
  return { ok: true, value: { endpoint: o.endpoint, p256dh: keys!.p256dh as string, auth: keys!.auth as string } };
}

/** A short, human label for a device list, from the browser's own user agent. Never trusted for anything else. */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const os = /iPhone|iPad|iPod/.test(ua) ? "iPhone / iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Macintosh|Mac OS X/.test(ua) ? "Mac" : /Linux|CrOS/.test(ua) ? "Linux" : "Device";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Firefox|FxiOS/.test(ua) ? "Firefox" : /CriOS|Chrome/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "Browser";
  return `${browser} on ${os}`;
}
