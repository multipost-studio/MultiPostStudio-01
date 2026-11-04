import { NextRequest } from "next/server";
import { trustRequest } from "@/lib/api/pre-auth";
import type { McpContext } from "./auth";

/** The shape every /api/v1 route handler has (see apiRoute in lib/api/handler.ts). */
export type RestHandler = (req: NextRequest, route: { params: Promise<Record<string, string>> }) => Promise<Response>;

export type RestResult = { ok: boolean; status: number; data: unknown; meta?: unknown; error: string | null };

/**
 * Run a public-API route handler in this process, as the already-authenticated MCP caller. The assistant therefore gets exactly what
 * the REST API gives: the same validation, plan limits, approval rule, idempotency and usage metering, with no second copy of that
 * logic to drift out of step.
 */
export async function callRest(
  handler: RestHandler,
  ctx: McpContext,
  input: { method: "GET" | "POST" | "PATCH" | "DELETE"; path: string; query?: Record<string, string | number | undefined>; body?: unknown; params?: Record<string, string>; idempotencyKey?: string },
): Promise<RestResult> {
  const url = new URL(`http://mcp.internal${input.path}`);
  for (const [k, v] of Object.entries(input.query ?? {})) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));

  const headers = new Headers();
  if (input.body !== undefined) headers.set("content-type", "application/json");
  if (input.idempotencyKey) headers.set("idempotency-key", input.idempotencyKey);

  const req = new NextRequest(url, { method: input.method, headers, body: input.body !== undefined ? JSON.stringify(input.body) : undefined });
  trustRequest(req, { keyId: ctx.keyId, orgId: ctx.orgId, scopes: ctx.scopes, name: ctx.name });

  const res = await handler(req, { params: Promise.resolve(input.params ?? {}) });
  let json: { success?: boolean; data?: unknown; meta?: unknown; error?: string | null } | null = null;
  try {
    json = await res.json();
  } catch {
    /* a non-JSON body is reported below */
  }
  if (!json) return { ok: false, status: res.status, data: null, error: `Unexpected response (${res.status}).` };
  return { ok: !!json.success && res.ok, status: res.status, data: json.data ?? null, meta: json.meta, error: json.error ?? null };
}
