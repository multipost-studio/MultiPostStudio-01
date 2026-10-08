/**
 * Model discovery helpers. Providers retire and rename models on their own
 * schedule, so a hard-coded model id eventually 404s. Instead each adapter asks
 * the provider which models the key can use, and these pure helpers pick the best
 * one from a ranked preference list. The hard-coded id is only a last resort.
 */

export type AiFailureReason = "invalid_key" | "quota" | "model_unavailable" | "unreachable" | "provider_error";

/** A provider answered with a non-2xx status. Carries the status so callers can tell a bad key from a retired model. */
export class ProviderHttpError extends Error {
  constructor(
    public readonly provider: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`${provider} ${status}: ${body.slice(0, 200)}`);
    this.name = "ProviderHttpError";
  }
}

/** Numbers inside an id, e.g. "gemini-2.5-flash" -> [2.5], "claude-haiku-4-5-20251001" -> [4, 5, 20251001]. */
function versionParts(id: string): number[] {
  return (id.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}

/** Newest first: compares the numeric parts left to right, then falls back to the name. */
function newestFirst(a: string, b: string): number {
  const va = versionParts(a);
  const vb = versionParts(b);
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    const d = (vb[i] ?? -1) - (va[i] ?? -1);
    if (d !== 0) return d;
  }
  return a.length - b.length || a.localeCompare(b);
}

/**
 * First preference that matches wins. A string is an exact id; a RegExp takes the
 * newest matching id. `fallback` is tried last. Returns null when nothing matches.
 */
export function chooseModel(available: string[], preference: (string | RegExp)[], fallback?: RegExp): string | null {
  const pool = [...new Set(available)];
  for (const p of preference) {
    if (typeof p === "string") {
      if (pool.includes(p)) return p;
    } else {
      const hit = pool.filter((id) => p.test(id)).sort(newestFirst)[0];
      if (hit) return hit;
    }
  }
  if (fallback) return pool.filter((id) => fallback.test(id)).sort(newestFirst)[0] ?? null;
  return null;
}

/** Map any thrown provider error to a reason the UI can explain. */
export function classifyProviderError(e: unknown): AiFailureReason {
  const status =
    e instanceof ProviderHttpError ? e.status : typeof (e as { status?: unknown })?.status === "number" ? (e as { status: number }).status : undefined;
  if (status === undefined) return "unreachable";
  if (status === 401 || status === 403) return "invalid_key";
  if (status === 429 || status === 402) return "quota";
  if (status === 404) return "model_unavailable";
  if (status === 400) {
    const body = (e instanceof ProviderHttpError ? e.body : String((e as { message?: unknown })?.message ?? "")).toLowerCase();
    if (/model|not found|not supported|deprecated|retired/.test(body)) return "model_unavailable";
  }
  return "provider_error";
}
