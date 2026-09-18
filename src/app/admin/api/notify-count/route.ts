import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getAdminModuleBadges } from "@/lib/admin-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let cacheEntry: { adminId: string; timestamp: number; badges: unknown } | null = null;
const CACHE_TTL_MS = 60_000; // 60 seconds

/**
 * Polled by the admin shell to keep sidebar badges and header bell current.
 * Cached in-process for 60s to prevent repetitive 14-query database scans.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isPlatformAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const now = Date.now();
  if (cacheEntry && cacheEntry.adminId === user.id && now - cacheEntry.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cacheEntry.badges, { headers: { "cache-control": "no-store" } });
  }

  const badges = await getAdminModuleBadges(user.id);
  cacheEntry = { adminId: user.id, timestamp: now, badges };
  return NextResponse.json(badges, { headers: { "cache-control": "no-store" } });
}
