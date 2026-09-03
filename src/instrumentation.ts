/**
 * Runs once when the server process boots (Node runtime only). Used to surface
 * a missing-env misconfiguration in production logs — env.ts never throws at
 * import so the build can't be blocked, so this is where an operator sees it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { envComplete } = await import("@/lib/env");
  if (!envComplete && process.env.NODE_ENV === "production") {
    console.error(
      "[startup] Required environment variables are missing or invalid " +
        "(DATABASE_URL, AUTH_SECRET >= 16 chars). The app is running but any " +
        "request that touches the database or auth will fail. Set them in the " +
        "hosting provider's environment and redeploy.",
    );
  }
}
