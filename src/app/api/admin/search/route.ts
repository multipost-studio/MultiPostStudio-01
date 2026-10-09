import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, getStaffPermissions } from "@/lib/session";
import { scopeFor, searchAdmin } from "@/lib/admin-search";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/search?q= — global admin search. Platform staff only; what is searched depends on their
 * permissions (see lib/admin-search). The caller is identified from the session; there is no id in the URL to tamper with.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isPlatformAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  try {
    await enforceRateLimit(`admin-search:${user.id}`, 120, 60_000);
  } catch (e) {
    if (e instanceof RateLimitError) return NextResponse.json({ error: "slow down" }, { status: 429, headers: { "Retry-After": "30" } });
    throw e;
  }
  try {
    const results = await searchAdmin(req.nextUrl.searchParams.get("q"), scopeFor(await getStaffPermissions()));
    return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error({ err, adminId: user.id }, "admin search failed");
    return NextResponse.json({ error: "Search failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
