import { appUrl } from "@/lib/env";
import { jsonResponse, preflight } from "@/lib/mcp/http";
import { issuer } from "@/lib/mcp/oauth";
import { ASSISTANT_SCOPES } from "@/lib/mcp/scopes";

export const runtime = "nodejs";

/** RFC 8414: where an AI assistant registers, sends people to approve, and trades the approval for tokens. */
export async function GET() {
  return jsonResponse(
    {
      issuer: issuer(),
      authorization_endpoint: appUrl("/api/mcp-oauth/authorize"),
      token_endpoint: appUrl("/api/mcp-oauth/token"),
      registration_endpoint: appUrl("/api/mcp-oauth/register"),
      revocation_endpoint: appUrl("/api/mcp-oauth/revoke"),
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ASSISTANT_SCOPES,
      service_documentation: appUrl("/integrations/ai"),
    },
    200,
    { "Cache-Control": "public, max-age=300" },
  );
}

export const OPTIONS = preflight;
