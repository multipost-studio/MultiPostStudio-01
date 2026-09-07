import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getWorkspaceContext, WS_COOKIE } from "@/lib/session";
import { isProduction } from "@/lib/env";

/**
 * Switch the active workspace from a plain link, then continue somewhere.
 *
 * Exists because the active workspace lives in a cookie and otherwise only
 * changes via the switcher's server action, which a link cannot invoke. Being
 * added to another org therefore left the invitee in their own workspace: the
 * invite notification opened /team and showed *their* team, with no sign of
 * the org they had just joined.
 *
 *   /switch?ws=<workspaceId>&next=/team
 */
export async function GET(req: NextRequest) {
  const ctx = await getWorkspaceContext();
  if (!ctx) {
    // Bounce through login and come back to the same switch link.
    const back = `/login?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(new URL(back, req.url));
  }

  const wsId = req.nextUrl.searchParams.get("ws") ?? "";
  const rawNext = req.nextUrl.searchParams.get("next") ?? "/dashboard";
  // Same-origin paths only — never reflect an attacker-supplied absolute URL.
  const next = /^\/(?!\/)[A-Za-z0-9\-._~!$&'()*+,;=:@%/?]*$/.test(rawNext) ? rawNext : "/dashboard";

  // Membership check, exactly as switchWorkspaceAction does: a user must never
  // be able to point the cookie at a workspace they were not granted.
  const target = ctx.workspaces.find((w) => w.workspace.id === wsId);
  if (!target) {
    return NextResponse.redirect(new URL(next, req.url));
  }

  const jar = await cookies();
  jar.set(WS_COOKIE, wsId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: isProduction,
  });

  return NextResponse.redirect(new URL(next, req.url));
}
