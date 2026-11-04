import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { jsonResponse, preflight, readLimited } from "@/lib/mcp/http";
import { CLIENT_PREFIX, newSecret, parseRegistration } from "@/lib/mcp/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CLIENTS_PER_DAY = 2_000; // a rolling ceiling, so open registration can't be used to fill the table and can't lock people out for good

/**
 * POST /api/mcp-oauth/register — Dynamic Client Registration (RFC 7591). AI assistants register themselves the first time a person
 * connects. Registering grants nothing: every connection still needs a signed-in person to approve it on the consent screen.
 */
export async function POST(req: NextRequest) {
  const ip = await clientIp();
  const rl = await rateLimit(`mcp-register:${ip}`, 10, 60 * 60_000);
  if (!rl.ok) return jsonResponse({ error: "slow_down", error_description: "Too many registrations. Try again later." }, 429, { "Retry-After": "600" });

  const raw = await readLimited(req, 20_000);
  if (!raw.ok) return jsonResponse({ error: "invalid_client_metadata", error_description: "The request is too large." }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw.text);
  } catch {
    return jsonResponse({ error: "invalid_client_metadata", error_description: "The body is not valid JSON." }, 400);
  }

  const reg = parseRegistration(body);
  if (!reg.ok) return jsonResponse({ error: reg.error, error_description: reg.description }, 400);

  try {
    if ((await db.oAuthClient.count({ where: { createdAt: { gte: new Date(Date.now() - 86_400_000) } } })) >= MAX_CLIENTS_PER_DAY) return jsonResponse({ error: "temporarily_unavailable", error_description: "Registration is closed for now." }, 503);
    const client = await db.oAuthClient.create({
      data: { id: newSecret(CLIENT_PREFIX, 16), name: reg.name, redirectUris: JSON.stringify(reg.redirectUris) },
    });
    return jsonResponse(
      {
        client_id: client.id,
        client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
        client_name: client.name,
        redirect_uris: reg.redirectUris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
      201,
      { "Cache-Control": "no-store" },
    );
  } catch (e) {
    logger.error({ err: e }, "mcp oauth registration failed");
    return jsonResponse({ error: "server_error", error_description: "Something went wrong. Try again." }, 500);
  }
}

export const OPTIONS = preflight;
