import type { NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { authenticateMcp, McpAuthError } from "@/lib/mcp/auth";
import { handleRpc, invalidRequest, parseError, type RpcResponse } from "@/lib/mcp/protocol";
import { jsonResponse, preflight, readLimited, CORS } from "@/lib/mcp/http";
import { resourceMetadataUrl } from "@/lib/mcp/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BATCH = 5; // batching was dropped from the newest MCP version; older clients that use it send a handful at most

/**
 * POST /api/mcp — the Model Context Protocol endpoint AI assistants connect to.
 * Auth: `Authorization: Bearer <API key | OAuth access token>`. An unauthenticated call gets a 401 that points at the OAuth metadata,
 * which is how Claude and ChatGPT discover the sign-in screen.
 */
export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await authenticateMcp(req);
  } catch (e) {
    if (e instanceof McpAuthError) {
      const headers = new Headers(e.headers);
      if (e.status === 401) {
        headers.set("WWW-Authenticate", `Bearer resource_metadata="${resourceMetadataUrl()}"${e.invalidToken ? ', error="invalid_token"' : ""}`);
      }
      const body: RpcResponse = { jsonrpc: "2.0", id: null, error: { code: -32001, message: e.message } };
      return jsonResponse(body, e.status, headers);
    }
    logger.error({ err: e }, "mcp authentication failed unexpectedly");
    return jsonResponse({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error." } }, 500);
  }

  const raw = await readLimited(req);
  if (!raw.ok) return jsonResponse(invalidRequest("The request is too large."), 413);
  let message: unknown;
  try {
    message = JSON.parse(raw.text);
  } catch {
    return jsonResponse(parseError(), 400);
  }

  if (Array.isArray(message)) {
    if (message.length === 0 || message.length > MAX_BATCH) return jsonResponse(invalidRequest(`Send 1 to ${MAX_BATCH} messages per request.`), 400);
    // One after another, so a batch can't run many tool calls at once and slip past the rate limit.
    const replies: RpcResponse[] = [];
    for (const m of message) {
      const r = await handleRpc(m, ctx);
      if (r) replies.push(r);
    }
    return replies.length === 0 ? new Response(null, { status: 202, headers: CORS }) : jsonResponse(replies);
  }

  const reply = await handleRpc(message, ctx);
  return reply === null ? new Response(null, { status: 202, headers: CORS }) : jsonResponse(reply);
}

/** This server keeps no sessions and sends no unsolicited messages, so there is no stream to open (a permitted answer, MCP spec). */
const notAllowed = () => new Response(null, { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
export const GET = notAllowed;
export const DELETE = notAllowed;
export const OPTIONS = preflight;
