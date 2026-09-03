import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { logger } from "@/lib/logger";

/**
 * Double-sided referral program. A user shares their link
 * ({APP_URL}/signup?ref=CODE); when the referee signs up a Referral row is
 * created, and on the configured trigger both sides get bonus AI credits added
 * to their org's monthly allowance (summed in `bonusAiCreditsForOrg`).
 *
 * Everything is admin-configurable via SystemSetting (see src/lib/settings.ts).
 */

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars

function genCode(len = 7): string {
  const b = randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[b[i] % CODE_ALPHABET.length];
  return s;
}

/** Get (or lazily create) the user's unique referral code. */
export async function ensureReferralCode(userId: string): Promise<string> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
  if (u?.referralCode) return u.referralCode;
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = genCode();
    try {
      await db.user.update({ where: { id: userId }, data: { referralCode: code } });
      return code;
    } catch {
      // unique clash — retry
    }
  }
  throw new Error("could not allocate referral code");
}

export function referralLink(code: string): string {
  return appUrl(`/signup?ref=${code}`);
}

/**
 * Record that `refereeUserId` (email `refereeEmail`) signed up via `code`.
 * No-ops if referrals are disabled, the code is unknown, it's a self-referral,
 * or this referee was already attributed.
 */
export async function attributeReferral(code: string, refereeUserId: string, refereeEmail: string) {
  const s = await getSettings();
  if (!s.referralEnabled || !code) return;
  const clean = code.trim().toUpperCase().slice(0, 16);

  const referrer = await db.user.findUnique({ where: { referralCode: clean }, select: { id: true } });
  if (!referrer || referrer.id === refereeUserId) return;
  if (await db.referral.findUnique({ where: { refereeId: refereeUserId } })) return;

  const ref = await db.referral.create({
    data: {
      code: clean,
      referrerId: referrer.id,
      refereeId: refereeUserId,
      refereeEmail,
      status: "signed_up",
    },
  });

  if (s.referralTrigger === "signup") {
    await convertReferral(refereeUserId).catch((e) => logger.warn({ err: e }, "referral immediate-convert failed"));
  }
  return ref;
}

/** Mark the referee's referral converted and grant both rewards. Idempotent. */
export async function convertReferral(refereeUserId: string) {
  const ref = await db.referral.findUnique({ where: { refereeId: refereeUserId } });
  if (!ref || ref.status === "void") return;
  const s = await getSettings();
  if (!s.referralEnabled) return;

  if (ref.status !== "converted") {
    await db.referral.update({ where: { id: ref.id }, data: { status: "converted", convertedAt: new Date() } });
  }

  await grantSide(ref.id, ref.referrerId, "referrer", s.referralRewardReferrer, ref.rewardedReferrer);
  if (ref.refereeId) {
    await grantSide(ref.id, ref.refereeId, "referee", s.referralRewardReferee, ref.rewardedReferee);
  }
}

async function grantSide(referralId: string, userId: string, side: "referrer" | "referee", credits: number, already: boolean) {
  if (already || credits <= 0) return;
  const membership = await db.membership.findFirst({
    where: { userId, status: "active" },
    orderBy: { createdAt: "asc" },
    select: { orgId: true },
  });
  await db.referralReward.create({
    data: { referralId, userId, orgId: membership?.orgId ?? "", aiCredits: credits, side },
  });
  await db.referral.update({
    where: { id: referralId },
    data: side === "referrer" ? { rewardedReferrer: true } : { rewardedReferee: true },
  });
}

/**
 * When a user finally lands in an org (onboarding), point any of their
 * unassigned referral rewards at it.
 */
export async function reconcileReferralRewards(userId: string, orgId: string) {
  await db.referralReward.updateMany({ where: { userId, orgId: "" }, data: { orgId } });
}

/** Bonus monthly AI credits for an org from referral rewards. */
export async function bonusAiCreditsForOrg(orgId: string): Promise<number> {
  if (!orgId) return 0;
  const agg = await db.referralReward.aggregate({ where: { orgId }, _sum: { aiCredits: true } });
  return agg._sum.aiCredits ?? 0;
}

export async function referralStats(userId: string) {
  const [rows, rewards] = await Promise.all([
    db.referral.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: "desc" },
      include: { referee: { select: { name: true, email: true } } },
    }),
    db.referralReward.aggregate({ where: { userId, side: "referrer" }, _sum: { aiCredits: true } }),
  ]);
  return {
    total: rows.length,
    converted: rows.filter((r) => r.status === "converted").length,
    creditsEarned: rewards._sum.aiCredits ?? 0,
    recent: rows.slice(0, 20).map((r) => ({
      id: r.id,
      who: r.referee?.name ?? r.refereeEmail ?? "Pending sign-up",
      email: r.referee?.email ?? r.refereeEmail ?? "",
      status: r.status,
      rewarded: r.rewardedReferrer,
      at: r.createdAt.toISOString(),
    })),
  };
}
