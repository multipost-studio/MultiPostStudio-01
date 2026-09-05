import { NextResponse, type NextRequest } from "next/server";
import { completeIntegrationAuthorization, verifyIntegrationState, INTEGRATION_STATE_COOKIE } from "@/lib/integrations/oauth";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * GET /api/integrations/:provider/callback — same shape as the social OAuth
 * callback, but completes a ConnectedIntegration connection instead.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(req.url);
  const back = new URL("/integrations", req.url);

  const clearCookie = (res: NextResponse) => {
    res.cookies.set(INTEGRATION_STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  };

  const providerError = url.searchParams.get("error");
  if (providerError) {
    back.searchParams.set("error", `${provider}: ${providerError}`);
    return clearCookie(NextResponse.redirect(back));
  }

  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state") ?? undefined;
  const cookieState = req.cookies.get(INTEGRATION_STATE_COOKIE)?.value;

  if (!code || !stateParam || !cookieState || stateParam !== cookieState) {
    back.searchParams.set("error", "invalid-oauth-state");
    return clearCookie(NextResponse.redirect(back));
  }

  const state = verifyIntegrationState(stateParam);
  if (!state || state.provider !== provider) {
    back.searchParams.set("error", "expired-oauth-state");
    return clearCookie(NextResponse.redirect(back));
  }

  try {
    await completeIntegrationAuthorization(state, code);
    back.searchParams.set("connected", provider);
  } catch (e) {
    logger.error({ err: e, provider }, "integration oauth callback failed");
    back.searchParams.set("error", `${provider}-connect-failed`);
  }
  return clearCookie(NextResponse.redirect(back));
}
