import { headers } from "next/headers";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Binds a JWT session to a Device row so "Sign out device" actually works.
 *
 * Before this, Device rows were created only by the seed and `revokedAt` was
 * never consulted during session validation — the settings page said
 * "(signed out)" while that browser's token kept working indefinitely.
 *
 * Sessions are JWTs (no server session table), so revocation needs one
 * identifier in the token that the server can check. The token carries the
 * device id; the jwt callback rejects the session once that row is revoked.
 */

/** Human label from a UA string. Good enough to recognise your own devices. */
function labelFor(ua: string): string {
  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : /Firefox\//.test(ua) ? "Firefox"
    : "Browser";
  const os =
    /Windows/.test(ua) ? "Windows"
    : /Android/.test(ua) ? "Android"
    : /iPhone|iPad|iOS/.test(ua) ? "iOS"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /Linux/.test(ua) ? "Linux"
    : "Unknown OS";
  return `${browser} · ${os}`;
}

/**
 * Record the device signing in and return its id for the token.
 *
 * Reuses an existing non-revoked row for the same user agent + IP so repeated
 * sign-ins don't fill the list with duplicates. Never throws: a failure here
 * must not block login — it only means this session cannot be revoked
 * individually, which is the behaviour that existed before.
 */
export async function registerDevice(userId: string): Promise<string | undefined> {
  try {
    const h = await headers();
    const ua = h.get("user-agent") ?? "unknown";
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      "unknown";

    const existing = await db.device.findFirst({
      where: { userId, userAgent: ua, ip, revokedAt: null },
      select: { id: true },
    });
    if (existing) {
      await db.device.update({ where: { id: existing.id }, data: { lastSeenAt: new Date() } });
      return existing.id;
    }

    const created = await db.device.create({
      data: { userId, label: labelFor(ua), userAgent: ua.slice(0, 400), ip, lastSeenAt: new Date() },
      select: { id: true },
    });
    return created.id;
  } catch (err) {
    logger.warn({ err, userId }, "device registration failed — session will not be individually revocable");
    return undefined;
  }
}

/**
 * Is this token's device still allowed to hold a session?
 *
 * Deliberately permissive in two cases so this cannot mass-log-out users:
 *  - no device id: tokens issued before this shipped have no binding. They
 *    stay valid and pick one up at next sign-in.
 *  - lookup failure: a database blip must not sign everyone out. It is logged.
 *
 * A row that exists and is revoked is the one case that ends the session.
 */
export async function deviceSessionValid(deviceId: unknown): Promise<boolean> {
  if (typeof deviceId !== "string" || !deviceId) return true; // legacy token
  try {
    const d = await db.device.findUnique({
      where: { id: deviceId },
      select: { revokedAt: true },
    });
    if (!d) return true; // row deleted (e.g. user cleanup) — not a revocation
    return d.revokedAt === null;
  } catch (err) {
    logger.error({ err, deviceId }, "device revocation check failed — allowing session");
    return true;
  }
}
