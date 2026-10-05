import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { originAllowed } from "@/lib/csrf";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_DAYS,
  consentModeFromEnv,
  consentStatus,
  countryFrom,
  parseConsent,
  privacySignalOn,
} from "@/lib/consent";
import { cookieDomainFor, FIRST_TOUCH_COOKIE, LAST_TOUCH_COOKIE, VISITOR_COOKIE } from "@/lib/attribution";
import { cookieSecure } from "@/lib/attribution-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function statusFor(req: NextRequest) {
  return consentStatus({
    country: countryFrom(req.headers),
    choice: parseConsent(req.cookies.get(CONSENT_COOKIE)?.value),
    signal: privacySignalOn(req.headers),
    mode: consentModeFromEnv(),
  });
}

/** What the banner and Google Analytics loader need: may analytics run, and has this visitor chosen yet? */
export async function GET(req: NextRequest) {
  return NextResponse.json(statusFor(req), { headers: NO_STORE });
}

const body = z.object({ choice: z.enum(["all", "essential"]) });

/**
 * Record the visitor's choice. Declining also removes the analytics cookies we
 * already set, so withdrawing consent takes effect immediately rather than at
 * the cookies' natural expiry.
 */
export async function POST(req: NextRequest) {
  if (!originAllowed(req)) return new NextResponse(null, { status: 403 });
  const limited = await rateLimit(`consent:${await clientIp()}`, 60, 60_000).catch(() => ({ ok: true }));
  if (!limited.ok) return new NextResponse(null, { status: 429 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });

  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const domain = cookieDomainFor(host);
  const base = { path: "/", sameSite: "lax" as const, secure: cookieSecure, domain };

  // Build the response from the new choice, then read status as if the cookie were already set.
  const choice = parsed.data.choice;
  const status = consentStatus({
    country: countryFrom(req.headers),
    choice,
    signal: privacySignalOn(req.headers),
    mode: consentModeFromEnv(),
  });
  const res = NextResponse.json(status, { headers: NO_STORE });
  res.cookies.set(CONSENT_COOKIE, choice, { ...base, httpOnly: true, maxAge: CONSENT_MAX_AGE_DAYS * 86_400 });
  if (choice === "essential") {
    for (const name of [VISITOR_COOKIE, FIRST_TOUCH_COOKIE, LAST_TOUCH_COOKIE]) res.cookies.set(name, "", { ...base, httpOnly: true, maxAge: 0 });
  }
  return res;
}
