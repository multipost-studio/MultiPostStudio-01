import type { NextRequest } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { jsonResponse, preflight, readLimited } from "@/lib/mcp/http";
import { handleTokenRequest } from "@/lib/mcp/token-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };

/** POST /api/mcp-oauth/token — exchange an authorization code, or a refresh token, for tokens. */
export async function POST(req: NextRequest) {
  const ip = await clientIp();
  const rl = await rateLimit(`mcp-token:${ip}`, 60, 60_000);
  if (!rl.ok) return jsonResponse({ error: "slow_down", error_description: "Too many requests." }, 429, { ...NO_STORE, "Retry-After": "30" });

  const raw = await readLimited(req, 20_000);
  if (!raw.ok) return jsonResponse({ error: "invalid_request", error_description: "The request is too large." }, 413, NO_STORE);

  let params: URLSearchParams;
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    try {
      const body = JSON.parse(raw.text) as Record<string, unknown>;
      params = new URLSearchParams(Object.entries(body ?? {}).filter(([, v]) => typeof v === "string") as [string, string][]);
    } catch {
      return jsonResponse({ error: "invalid_request", error_description: "The body is not valid JSON." }, 400, NO_STORE);
    }
  } else {
    params = new URLSearchParams(raw.text);
  }

  try {
    const out = await handleTokenRequest(params);
    return jsonResponse(out.body, out.status, NO_STORE);
  } catch (e) {
    logger.error({ err: e }, "mcp oauth token endpoint failed");
    return jsonResponse({ error: "server_error", error_description: "Something went wrong. Try again." }, 500, NO_STORE);
  }
}

export const OPTIONS = preflight;
