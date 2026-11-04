import { appUrl } from "@/lib/env";
import { jsonResponse, preflight } from "@/lib/mcp/http";
import { issuer, mcpUrl } from "@/lib/mcp/oauth";
import { ASSISTANT_SCOPES } from "@/lib/mcp/scopes";

export const runtime = "nodejs";

/** RFC 9728: tells an AI assistant which server signs people in for /api/mcp. Served at the root and at any path-suffixed address clients try. */
export async function GET() {
  return jsonResponse(
    {
      resource: mcpUrl(),
      resource_name: "MultiPost Studio",
      authorization_servers: [issuer()],
      scopes_supported: ASSISTANT_SCOPES,
      bearer_methods_supported: ["header"],
      resource_documentation: appUrl("/integrations/ai"),
    },
    200,
    { "Cache-Control": "public, max-age=300" },
  );
}

export const OPTIONS = preflight;
