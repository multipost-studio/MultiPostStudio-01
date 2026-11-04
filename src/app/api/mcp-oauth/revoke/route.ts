import type { NextRequest } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { CORS, preflight, readLimited } from "@/lib/mcp/http";
import { revokeToken } from "@/lib/mcp/token-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/mcp-oauth/revoke — RFC 7009. Always answers 200: it never reveals whether a token existed. */
export async function POST(req: NextRequest) {
  const ip = await clientIp();
  const rl = await rateLimit(`mcp-revoke:${ip}`, 30, 60_000);
  if (rl.ok) {
    const raw = await readLimited(req, 20_000);
    if (raw.ok) {
      const token = new URLSearchParams(raw.text).get("token");
      if (token) await revokeToken(token).catch((e) => logger.warn({ err: e }, "mcp oauth revoke failed"));
    }
  }
  return new Response(null, { status: 200, headers: CORS });
}

export const OPTIONS = preflight;
