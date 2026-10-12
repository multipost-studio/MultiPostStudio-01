/** Browser-side helpers for Web Push. No server imports, so client components can use them. */

/** The server's VAPID public key arrives as URL-safe base64; `pushManager.subscribe` wants raw bytes. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushSupport =
  /** Not decided yet (server render, or before the browser has been asked). */
  | "loading"
  /** This browser cannot do push at all. */
  | "unsupported"
  /** iPhone/iPad in a browser tab: push only works once the app is on the Home Screen. */
  | "needs-install"
  | "default"
  | "denied"
  | "granted";

export function pushSupport(env: {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  permission: string | undefined;
  iosBrowserTab: boolean;
}): PushSupport {
  if (env.iosBrowserTab) return "needs-install";
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return "unsupported";
  if (env.permission === "granted") return "granted";
  if (env.permission === "denied") return "denied";
  return "default";
}

/** Only a path on this site may be opened from a notification message. */
export function safeInAppPath(url: unknown): string | null {
  return typeof url === "string" && url.startsWith("/") && !url.startsWith("//") && !url.includes("\\") && url.length <= 500 ? url : null;
}
