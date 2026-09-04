import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * POST /api/threads/deauthorize — Meta pings this when a user removes the app
 * from their Threads account. We just acknowledge; token cleanup happens on the
 * next sync when the API starts returning 401 for that account.
 *
 * ponytail: signed_request HMAC is not verified — add it if we start acting on
 * the payload rather than just logging.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    logger.info({ hasSignedRequest: form.has("signed_request") }, "threads deauthorize ping");
  } catch {
    // Meta also sends an empty verification ping — fine.
  }
  return NextResponse.json({ ok: true });
}
