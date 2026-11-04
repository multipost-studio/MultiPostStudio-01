import { appUrl } from "@/lib/env";
import { buildOpenApi } from "@/lib/api/openapi";
import { jsonResponse, preflight } from "@/lib/mcp/http";

export const runtime = "nodejs";

/** GET /api/v1/openapi.json — the public API's OpenAPI description. Public: it documents the API, it exposes no data. */
export async function GET() {
  return jsonResponse(buildOpenApi(appUrl()), 200, { "Cache-Control": "public, max-age=300" });
}

export const OPTIONS = preflight;
