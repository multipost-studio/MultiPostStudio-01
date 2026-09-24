import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, getWorkspaceContext } from "@/lib/session";
import { startAuthorization, STATE_COOKIE } from "@/lib/social/oauth";
import { getProvider } from "@/lib/social/providers";
import { hasEntitlement } from "@/lib/entitlements";
import { isProduction } from "@/lib/env";

export const runtime = "nodejs";

/**
 * GET /api/oauth/:platform/start — begin an OAuth connect for the active
 * workspace. Requires a logged-in user with channels.connect. 302s to the
 * provider's consent screen.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const back = new URL("/integrations", req.url);

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=/integrations`, req.url));
  const { enforceRateLimit, RateLimitError } = await import("@/lib/rate-limit");
  try {
    // 30 OAuth starts/min/user — consent redirects fan out to providers.
    await enforceRateLimit(`oauth-start:${user.id}`, 30, 60_000);
  } catch (e) {
    if (e instanceof RateLimitError) {
      back.searchParams.set("error", "rate-limited");
      return NextResponse.redirect(back);
    }
    throw e;
  }

  const ctx = await getWorkspaceContext();
  if (!ctx?.active) {
    back.searchParams.set("error", "no-workspace");
    return NextResponse.redirect(back);
  }
  // Effective permissions (org role + workspace override + custom role),
  // not the bare org role — custom-role holders with channels.connect
  // must not be wrongly denied here.
  if (!ctx.active.permissions.includes("channels.connect")) {
    back.searchParams.set("error", "forbidden");
    return NextResponse.redirect(back);
  }
  if (!getProvider(platform)) {
    back.searchParams.set("error", `${platform}-not-configured`);
    return NextResponse.redirect(back);
  }
  // Per-platform plan gating: YouTube/Pinterest/Threads/GBP are Pro-tier.
  // This route is directly addressable, so hiding the button isn't a gate.
  if (!(await hasEntitlement(ctx.active.org.id, `platform_${platform}`))) {
    back.searchParams.set("error", `${platform}-not-in-plan`);
    return NextResponse.redirect(back);
  }

  const { redirectUrl, stateCookie } = startAuthorization(platform, ctx.active.workspace.id, user.id);

  const res = NextResponse.redirect(redirectUrl);
  res.cookies.set(STATE_COOKIE, stateCookie, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax", // must survive the provider's redirect back
    path: "/",
    maxAge: 600,
  });
  return res;
}
