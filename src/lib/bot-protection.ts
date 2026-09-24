import { env, flags } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Cloudflare Turnstile bot protection (optional, reversible).
 *
 * - Unconfigured (no TURNSTILE_SECRET_KEY): verifyTurnstile() returns
 *   { ok: true, skipped: true } so every flow keeps working with zero config
 *   (dev, self-host, existing prod). This is intentional fail-open.
 * - Configured: token is verified server-side against Cloudflare. Missing or
 *   invalid tokens return { ok: false } and callers must reject the request.
 *
 * Callers pass the `cf-turnstile-response` form field (or `turnstileToken`
 * string for JSON APIs). Never log the token.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
): Promise<{ ok: boolean; skipped?: boolean }> {
  if (!flags.botProtection || !env.TURNSTILE_SECRET_KEY) {
    return { ok: true, skipped: true };
  }
  if (!token || token.length > 8000) return { ok: false };
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "turnstile verification http error");
      // Fail-closed when configured: a Cloudflare outage shouldn't become a
      // bot bypass. Callers surface a retryable error.
      return { ok: false };
    }
    const j = (await res.json()) as { success?: boolean };
    return { ok: j.success === true };
  } catch (e) {
    logger.warn({ err: e }, "turnstile verification failed");
    return { ok: false };
  }
}

/** Extract a Turnstile token from FormData or a plain object (no throw). */
export function turnstileFrom(formData: FormData | undefined): string | null {
  if (!formData) return null;
  const v = formData.get("cf-turnstile-response");
  return typeof v === "string" && v ? v : null;
}
