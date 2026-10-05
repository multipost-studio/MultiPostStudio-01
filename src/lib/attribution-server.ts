import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { appUrl, isProduction } from "@/lib/env";
import { decodeTouch, FIRST_TOUCH_COOKIE, LAST_TOUCH_COOKIE, VISITOR_COOKIE, VISITOR_ID_RE } from "@/lib/attribution";

/** Hosts whose referrals are "us", so internal navigation is never an acquisition source. */
export function selfHostsFor(requestHost: string | null | undefined): string[] {
  const hosts = new Set<string>(["multipoststudio.online", "app.multipoststudio.online", "localhost"]);
  if (requestHost) hosts.add(requestHost.split(":")[0].toLowerCase());
  try {
    hosts.add(new URL(appUrl()).hostname.toLowerCase());
  } catch {
    /* appUrl misconfigured: the static hosts above still apply */
  }
  return [...hosts];
}

export const cookieSecure = isProduction;

/**
 * Record how a just-created user arrived, from the first/last-touch cookies set
 * by /api/track/visit. Idempotent and never throws: attribution must not be
 * able to fail a signup. Users with no cookie (tracking blocked, DNT/GPC, no
 * JavaScript) get no row, so reports show them honestly as "(not tracked)"
 * instead of inventing a "Direct" visit.
 */
export async function attributeSignup(userId: string): Promise<void> {
  try {
    const jar = await cookies();
    const first = decodeTouch(jar.get(FIRST_TOUCH_COOKIE)?.value);
    if (!first) return;
    const last = decodeTouch(jar.get(LAST_TOUCH_COOKIE)?.value) ?? first;
    const vid = jar.get(VISITOR_COOKIE)?.value;
    const data = {
      visitorId: vid && VISITOR_ID_RE.test(vid) ? vid : null,
      channel: first.channel,
      source: first.source,
      medium: first.medium,
      campaign: first.campaign,
      term: first.term,
      content: first.content,
      referrerHost: first.referrerHost,
      landingPath: first.landingPath,
      lastChannel: last.channel,
      lastSource: last.source,
      lastMedium: last.medium,
      lastCampaign: last.campaign,
    };
    await db.userAttribution.upsert({ where: { userId }, create: { userId, ...data }, update: {} });
  } catch (err) {
    logger.warn({ err, userId }, "attributeSignup failed");
  }
}
