import { NextResponse, type NextRequest } from "next/server";
import { completeAuthorization, verifyState, STATE_COOKIE } from "@/lib/social/oauth";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * GET /api/oauth/:platform/callback — provider redirects here with ?code&state.
 * Verifies the signed state (and that it matches the cookie), exchanges the
 * code, stores encrypted tokens, then bounces to /integrations.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const url = new URL(req.url);
  const back = new URL("/integrations", req.url);

  const clearCookie = (res: NextResponse) => {
    res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  };

  const providerError = url.searchParams.get("error");
  if (providerError) {
    back.searchParams.set("error", `${platform}: ${providerError}`);
    return clearCookie(NextResponse.redirect(back));
  }

  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state") ?? undefined;
  const cookieState = req.cookies.get(STATE_COOKIE)?.value;

  if (!code || !stateParam || !cookieState || stateParam !== cookieState) {
    back.searchParams.set("error", "invalid-oauth-state");
    return clearCookie(NextResponse.redirect(back));
  }

  const state = verifyState(stateParam);
  if (!state || state.platform !== platform) {
    back.searchParams.set("error", "expired-oauth-state");
    return clearCookie(NextResponse.redirect(back));
  }

  try {
    await completeAuthorization(state, code);
    back.searchParams.set("connected", platform);
  } catch (e) {
    logger.error({ err: e, platform }, "oauth callback failed");
    back.searchParams.set("error", `${platform}-connect-failed`);
  }
  return clearCookie(NextResponse.redirect(back));
}
