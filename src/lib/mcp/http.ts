/**
 * Shared bits for the cookie-less endpoints an AI assistant talks to (MCP and OAuth). Authentication here is a Bearer token or a PKCE
 * proof, never a cookie, so letting any origin call them is safe and lets browser-based clients (MCP Inspector, web assistants) work.
 */
export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Idempotency-Key",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Retry-After",
  "Access-Control-Max-Age": "86400",
};

export function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  const h = new Headers(headers);
  for (const [k, v] of Object.entries(CORS)) h.set(k, v);
  h.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers: h });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

/** Read a small request body as text, refusing anything over `max` bytes (declared or actual). */
export async function readLimited(req: Request, max = 1_000_000): Promise<{ ok: true; text: string } | { ok: false }> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > max) return { ok: false };
  const text = await req.text();
  return text.length > max ? { ok: false } : { ok: true, text };
}
