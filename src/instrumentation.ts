/**
 * Runs once when the server process boots (Node runtime only). Used to surface
 * a missing-env misconfiguration in production logs — env.ts never throws at
 * import so the build can't be blocked, so this is where an operator sees it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { envComplete, isProduction, flags } = await import("@/lib/env");
  if (!envComplete && process.env.NODE_ENV === "production") {
    console.error(
      "[startup] Required environment variables are missing or invalid " +
        "(DATABASE_URL, AUTH_SECRET >= 16 chars). The app is running but any " +
        "request that touches the database or auth will fail. Set them in the " +
        "hosting provider's environment and redeploy.",
    );
  }
  // The in-memory rate limiter is per-instance — on serverless (multiple
  // instances, no shared state) that's not a soft-degrade, it's effectively no
  // rate limiting at all, with nothing else to signal that. Surface it loudly
  // once at boot rather than let it fail silently.
  if (isProduction && !flags.distributedRateLimit) {
    console.warn(
      "[startup] UPSTASH_REDIS_REST_URL/TOKEN are not set — rate limiting is " +
        "in-memory and per-instance only, which on serverless means it does " +
        "not meaningfully limit anything across instances. Set them for real " +
        "distributed rate limiting.",
    );
  }
}
