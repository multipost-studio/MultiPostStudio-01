import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { env, isProduction } from "@/lib/env";

/**
 * Shared guard for the /api/cron/* endpoints. These trigger real side effects
 * (publish jobs, automation runs, digest emails) so they're worth the same
 * constant-time compare every other secret check in this codebase uses —
 * plain `===` on a bearer token is a (small, but real) timing side-channel.
 *
 * Also fails closed in production when CRON_SECRET isn't set: the open-by-
 * default behavior only exists so the dev-mode client poller works with zero
 * config — a real deployment that forgot to set the secret should not
 * silently become an unauthenticated trigger for these jobs.
 */
export function authorizedCronRequest(req: NextRequest): boolean {
  if (!env.CRON_SECRET) return !isProduction;
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  return got.length === expected.length && timingSafeEqual(got, expected);
}
