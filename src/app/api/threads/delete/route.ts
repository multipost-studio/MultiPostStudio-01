import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { logger } from "@/lib/logger";
import { appUrl } from "@/lib/env";

export const runtime = "nodejs";

/**
 * POST /api/threads/delete — Meta's data-deletion-request callback. Must reply
 * with { url, confirmation_code } pointing at a page where the user can check
 * deletion status.
 *
 * ponytail: signed_request HMAC is not verified and no async deletion job is
 * enqueued yet — connected Threads data is removed when the account is
 * disconnected in /integrations. Wire real per-user deletion here if Threads
 * data volume grows.
 */
export async function POST(req: NextRequest) {
  const code = randomUUID();
  try {
    const form = await req.formData();
    logger.info({ code, hasSignedRequest: form.has("signed_request") }, "threads data-deletion request");
  } catch {
    logger.info({ code }, "threads data-deletion request (no body)");
  }
  return NextResponse.json({
    url: appUrl(`/legal/data-deletion?code=${code}`),
    confirmation_code: code,
  });
}
