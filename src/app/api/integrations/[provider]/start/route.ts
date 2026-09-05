import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, getWorkspaceContext } from "@/lib/session";
import { can } from "@/lib/rbac";
import { startIntegrationAuthorization, INTEGRATION_STATE_COOKIE } from "@/lib/integrations/oauth";
import { getIntegrationProvider } from "@/lib/integrations/providers";
import { isProduction } from "@/lib/env";

export const runtime = "nodejs";

/**
 * GET /api/integrations/:provider/start — begin an OAuth connect for a
 * file-source integration (Google Drive, ...). Requires integrations.manage.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const back = new URL("/integrations", req.url);

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/integrations", req.url));

  const ctx = await getWorkspaceContext();
  if (!ctx?.active) {
    back.searchParams.set("error", "no-workspace");
    return NextResponse.redirect(back);
  }
  if (!can(ctx.active.role, "integrations.manage")) {
    back.searchParams.set("error", "forbidden");
    return NextResponse.redirect(back);
  }
  if (!getIntegrationProvider(provider)) {
    back.searchParams.set("error", `${provider}-not-configured`);
    return NextResponse.redirect(back);
  }

  const { redirectUrl, stateCookie } = startIntegrationAuthorization(provider, ctx.active.workspace.id, user.id);

  const res = NextResponse.redirect(redirectUrl);
  res.cookies.set(INTEGRATION_STATE_COOKIE, stateCookie, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
