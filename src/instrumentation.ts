/**
 * Runs once when the server process boots (Node runtime only). Used to surface
 * a missing-env misconfiguration in production logs — env.ts never throws at
 * import so the build can't be blocked, so this is where an operator sees it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { envComplete, isProduction, flags, env } = await import("@/lib/env");
  if (!envComplete && process.env.NODE_ENV === "production") {
    console.error(
      "[startup] Required environment variables are missing or invalid " +
        "(DATABASE_URL, AUTH_SECRET >= 16 chars). The app is running but any " +
        "request that touches the database or auth will fail. Set them in the " +
        "hosting provider's environment and redeploy.",
    );
  }
  // OAuth tokens are encrypted at rest with TOKEN_ENC_KEY. Without a valid one
  // production refuses to encrypt or decrypt, so every connected account stops
  // working — but only at the moment someone publishes, not at deploy time.
  // Say it at boot, while there is still time to set it.
  if (isProduction) {
    const k = env.TOKEN_ENC_KEY;
    const bytes = k ? Buffer.from(k, "base64").length : 0;
    if (bytes !== 32) {
      console.error(
        `[startup] TOKEN_ENC_KEY is ${k ? `${bytes} bytes, not 32` : "not set"} — ` +
          "OAuth tokens cannot be encrypted or decrypted, so connecting an " +
          "account and publishing to any connected account will fail. " +
          "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
      );
    }
  }

  // Without a payment provider, paid plans cannot be sold. The app now refuses
  // to apply one in production rather than granting it free, which is right but
  // means upgrades are simply unavailable until this is set.
  if (isProduction && !flags.realBilling) {
    console.error(
      "[startup] No payment provider is configured (STRIPE_SECRET_KEY or " +
        "RAZORPAY_KEY_ID). Customers cannot upgrade to a paid plan; the " +
        "no-payment confirm path is refused in production so plans are not " +
        "granted for free.",
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
