import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { originAllowed } from "@/lib/csrf";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import {
  cookieDomainFor,
  decodeTouch,
  encodeTouch,
  FIRST_TOUCH_COOKIE,
  FIRST_TOUCH_DAYS,
  isLikelyBot,
  LAST_TOUCH_COOKIE,
  nextFirstTouch,
  nextLastTouch,
  parseTouch,
  trackingAllowed,
  VISITOR_COOKIE,
  VISITOR_ID_RE,
} from "@/lib/attribution";
import { cookieSecure, selfHostsFor } from "@/lib/attribution-server";
import { analyticsAllowed, CONSENT_COOKIE, consentModeFromEnv, countryFrom, parseConsent } from "@/lib/consent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({
  /** Path + query of the landing page (never the origin). */
  landing: z.string().max(600),
  referrer: z.string().max(600).nullish(),
});

const noContent = () => new NextResponse(null, { status: 204 });

/**
 * First-party acquisition beacon, called once per session from marketing and
 * auth pages. Records an anonymous visit and maintains the visitor / first-
 * touch / last-touch cookies that signup later turns into attribution.
 *
 * Privacy: honours Do Not Track and Global Privacy Control and the visitor's
 * cookie-consent choice (records nothing and sets nothing without consent where
 * opt-in is required), drops bots, stores no IP address or user agent, and keys
 * visits on a random cookie id.
 */
export async function POST(req: NextRequest) {
  if (!originAllowed(req)) return new NextResponse(null, { status: 403 });
  if (!trackingAllowed(req.headers)) return noContent();
  if (isLikelyBot(req.headers.get("user-agent"))) return noContent();

  // Consent is enforced here, not just in the banner: where opt-in is required
  // (EEA/UK/CH, or unknown location) nothing is recorded or set until the
  // visitor says yes, and a "no" anywhere stops it.
  const consented = analyticsAllowed({
    country: countryFrom(req.headers),
    choice: parseConsent(req.cookies.get(CONSENT_COOKIE)?.value),
    mode: consentModeFromEnv(),
  });
  if (!consented) return noContent();

  const limited = await rateLimit(`track:${await clientIp()}`, 120, 60_000).catch(() => ({ ok: true }));
  if (!limited.ok) return new NextResponse(null, { status: 429 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });

  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const touch = parseTouch({ landing: parsed.data.landing, referrer: parsed.data.referrer, selfHosts: selfHostsFor(host) });

  const existingVid = req.cookies.get(VISITOR_COOKIE)?.value;
  const visitorId = existingVid && VISITOR_ID_RE.test(existingVid) ? existingVid : crypto.randomUUID().replace(/-/g, "");

  try {
    await db.acquisitionVisit.create({
      data: {
        visitorId,
        channel: touch.channel,
        source: touch.source,
        medium: touch.medium,
        campaign: touch.campaign,
        term: touch.term,
        content: touch.content,
        referrerHost: touch.referrerHost,
        landingPath: touch.landingPath,
        clickId: touch.clickId,
      },
    });
  } catch (err) {
    // A missing table (migration pending) or a DB blip must never surface to visitors.
    logger.warn({ err }, "acquisition visit not recorded");
  }

  const first = nextFirstTouch(decodeTouch(req.cookies.get(FIRST_TOUCH_COOKIE)?.value), touch);
  const last = nextLastTouch(decodeTouch(req.cookies.get(LAST_TOUCH_COOKIE)?.value), touch);

  const res = noContent();
  const base = { path: "/", sameSite: "lax" as const, httpOnly: true, secure: cookieSecure, domain: cookieDomainFor(host) };
  res.cookies.set(VISITOR_COOKIE, visitorId, { ...base, maxAge: 365 * 86_400 });
  res.cookies.set(FIRST_TOUCH_COOKIE, encodeTouch(first), { ...base, maxAge: FIRST_TOUCH_DAYS * 86_400 });
  res.cookies.set(LAST_TOUCH_COOKIE, encodeTouch(last), { ...base, maxAge: FIRST_TOUCH_DAYS * 86_400 });
  return res;
}
