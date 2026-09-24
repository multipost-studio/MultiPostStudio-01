import { appUrl } from "@/lib/env";

/**
 * Lenient Origin/Referer check for cookie-less API routes (public v1 API uses
 * Bearer keys, not cookies): requests WITHOUT Origin/Referer (curl, workers,
 * server-to-server) always pass; requests WITH an Origin must match the app's
 * own host or localhost. This blunts browser CSRF against key-authenticated
 * endpoints without breaking API clients. Reversible: returns boolean, caller
 * decides the status.
 */
export function originAllowed(req: Request): boolean {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const candidate = origin ?? referer;
  if (!candidate) return true;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app")) return true;
  try {
    const allowed = new URL(appUrl()).hostname.toLowerCase();
    if (host === allowed) return true;
  } catch {
    /* fall through */
  }
  return host.endsWith("multipoststudio.online");
}
