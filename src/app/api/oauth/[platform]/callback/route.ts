import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
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

  const { enforceRateLimit, RateLimitError } = await import("@/lib/rate-limit");
  const { clientIp } = await import("@/lib/rate-limit");
  try {
    // 60 callbacks/min/IP — code exchange fans out to providers.
    await enforceRateLimit(`oauth-callback:${await clientIp()}`, 60, 60_000);
  } catch (e) {
    if (e instanceof RateLimitError) {
      back.searchParams.set("error", "rate-limited");
      return clearCookie(NextResponse.redirect(back));
    }
    throw e;
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

  // Bind the callback to the session that started the flow. The signed
  // state + cookie equality stops cross-site forgery, but without this
  // check anyone tricked into completing someone else's provider URL
  // (login-CSRF style, or a tossed state cookie) would attach their social
  // account to a workspace they never chose.
  const session = await auth();
  if (!session?.user?.id || session.user.id !== state.userId) {
    back.searchParams.set("error", "oauth-session-mismatch");
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
