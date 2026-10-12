import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { flags } from "@/lib/env";
import { originAllowed } from "@/lib/csrf";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { parsePushSubscription } from "@/lib/push/validate";
import { registerSubscription } from "@/lib/push/store";

export const runtime = "nodejs";

/**
 * POST /api/push/subscribe, called by the service worker when the browser replaces a device's subscription on its own
 * (the "pushsubscriptionchange" event), so notifications keep arriving without the person opening the app. The signed-in
 * session cookie identifies the account; the endpoint is checked against the real push services before it is stored.
 */
export async function POST(req: NextRequest) {
  if (!originAllowed(req)) return NextResponse.json({ ok: false }, { status: 403 });
  if (!flags.webPush) return NextResponse.json({ ok: false }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (user.isImpersonated) return NextResponse.json({ ok: false }, { status: 403 });
  try {
    await enforceRateLimit(`push-save:${user.id}`, 20, 3_600_000);
  } catch (e) {
    if (e instanceof RateLimitError) return NextResponse.json({ ok: false }, { status: 429 });
    throw e;
  }
  const body = (await req.json().catch(() => null)) as { subscription?: unknown; label?: unknown } | null;
  const parsed = parsePushSubscription(body?.subscription);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  await registerSubscription(user.id, parsed.value, req.headers.get("user-agent"), body?.label);
  return NextResponse.json({ ok: true });
}
