import type { NextRequest } from "next/server";
import { authenticateApiKey, ApiAuthError, type ApiKeyContext, type ApiScope } from "./auth";
import { apiError } from "./respond";
import { logger } from "@/lib/logger";

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
      const ctx = await authenticateApiKey(req, scope);
      const params = route?.params ? await route.params : {};
      return await fn(req, ctx, params);
    } catch (e) {
      if (e instanceof ApiAuthError) return apiError(e.status, e.message);
      logger.error({ err: e, path: req.nextUrl.pathname }, "api/v1 handler error");
      return apiError(500, "Internal error");
    }
  };
}
