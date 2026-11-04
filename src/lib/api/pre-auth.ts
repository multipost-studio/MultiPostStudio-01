import type { ApiKeyContext } from "./auth";

/**
 * Requests that the MCP endpoint has already authenticated and rate-limited, so the public-API handlers it calls in-process
 * (the same code that serves /api/v1) do not look for an API key again.
 *
 * Keyed by the Request OBJECT, in a WeakMap: only code in this process that holds the object can add to it, and a request that
 * arrives over the network is never in it. There is no header or value a caller could send to be treated as trusted.
 */
const trusted = new WeakMap<object, ApiKeyContext>();

export function trustRequest(req: object, ctx: ApiKeyContext): void {
  trusted.set(req, ctx);
}

export function trustedContext(req: object): ApiKeyContext | undefined {
  return trusted.get(req);
}
