import type { NextRequest } from "next/server";
import { authenticateApiKey, ApiAuthError, type ApiKeyContext, type ApiScope } from "./auth";
import { bumpUsage } from "@/lib/adapters/billing";
import { apiError } from "./respond";
import { logger } from "@/lib/logger";

// Route Handlers (unlike Server Actions, which get next.config.ts's
// serverActions.bodySizeLimit) have no built-in body-size ceiling — Vercel's
// own platform cap happens to backstop this in that environment, but a
// self-hosted deployment (this app ships a Dockerfile) has no such backstop
// unless the operator adds one at the reverse-proxy layer. Reject oversized
// mutating requests by their declared Content-Length before any read/parse
// work begins.
const MAX_API_BODY_BYTES = 2 * 1024 * 1024; // 2MB — generous for any real post/channel payload

/**
 * Wrap a public-API route: authenticates the key (optionally enforcing a
 * scope), then calls `fn` with the key context. Converts ApiAuthError and
 * unexpected throws into the standard error envelope.
 */
export function apiRoute(
  scope: ApiScope | undefined,
  fn: (req: NextRequest, ctx: ApiKeyContext, params: Record<string, string>) => Promise<Response>,
) {
  return async (req: NextRequest, route: { params: Promise<Record<string, string>> }) => {
    try {
      // Browser CSRF guard for mutating calls: server-to-server clients send
      // no Origin and always pass; browser cross-origin forgeries are 403.
      if (req.method !== "GET" && req.method !== "HEAD") {
        const { originAllowed } = await import("@/lib/csrf");
        if (!originAllowed(req)) return apiError(403, "Cross-origin request forbidden");
        const len = Number(req.headers.get("content-length") ?? "0");
        if (len > MAX_API_BODY_BYTES) return apiError(413, "Request body too large");
      }
      const ctx = await authenticateApiKey(req, scope);
      // Best-effort metering: the api_calls gauge was priced and displayed
      // but never written, so API usage was effectively free and invisible.
      // A metering failure must never fail the customer's API call.
      bumpUsage(ctx.orgId, "api_calls").catch((e) =>
        logger.warn({ err: e, orgId: ctx.orgId }, "api usage metering failed"),
      );
      const params = route?.params ? await route.params : {};
      return await fn(req, ctx, params);
    } catch (e) {
      if (e instanceof ApiAuthError) {
        return apiError(e.status, e.message, undefined, {
          headers: e.rateLimitHeaders,
          retryAfterSec: e.retryAfterSec,
        });
      }
      logger.error({ err: e, path: req.nextUrl.pathname }, "api/v1 handler error");
      return apiError(500, "Internal error");
    }
  };
}
