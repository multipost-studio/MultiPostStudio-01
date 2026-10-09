import { NextResponse, type NextRequest } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { getUnreadCount, isFilter, listNotifications } from "@/lib/notifications/service";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The bell's data source. The app has no websocket/SSE layer, so the bell polls this (about once a minute
 * while the tab is visible, and again when the tab regains focus). `?count=1` returns just the unread
 * number for the cheap check; otherwise a page of notifications, newest first, with a cursor for "load more".
 *
 * Everything is scoped to the signed-in user and their active workspace inside the query; there is no
 * user or workspace id in the URL to tamper with.
 */
export async function GET(req: NextRequest) {
  const ctx = await getWorkspaceContext();
  if (!ctx || !ctx.active) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const scope = { userId: ctx.user.id, workspaceId: ctx.active.workspace.id };

  try {
    await enforceRateLimit(`notifications:${ctx.user.id}`, 240, 60_000);
  } catch (e) {
    if (e instanceof RateLimitError) return NextResponse.json({ error: "slow down" }, { status: 429, headers: { "Retry-After": "30" } });
    throw e;
  }

  const sp = req.nextUrl.searchParams;
  try {
    if (sp.get("count") === "1") {
      return NextResponse.json({ unread: await getUnreadCount(scope) }, { headers: { "Cache-Control": "no-store" } });
    }
    const filter = sp.get("filter");
    const limit = Number(sp.get("limit"));
    const data = await listNotifications(scope, {
      filter: isFilter(filter) ? filter : "all",
      cursor: sp.get("cursor"),
      limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
      q: sp.get("q"),
    });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error({ err, userId: ctx.user.id }, "notifications api failed");
    return NextResponse.json({ error: "Couldn't load notifications" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
