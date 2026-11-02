import { db } from "@/lib/db";

/**
 * What Instagram itself told us about trial reels for an account, kept on the account so the composer can show it before the next
 * post: the last time Instagram refused a trial reel and why. It is only ever written from a real refusal Instagram sent, and it
 * stops being shown after a week (an account can become eligible again, e.g. by gaining followers or leaving a restriction).
 */
export type TrialRefusal = { at: string; reason: string };

const REFUSAL_SHOWN_MS = 7 * 86_400_000;

function readMeta(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The refusal to show for an account's metadata, or null when there is none or it is older than a week. Never throws. */
export function readTrialRefusal(metadata: string | null | undefined, now: number = Date.now()): TrialRefusal | null {
  const r = readMeta(metadata).trialReelRefused as { at?: unknown; reason?: unknown } | undefined;
  if (!r || typeof r.at !== "string" || typeof r.reason !== "string") return null;
  const at = Date.parse(r.at);
  if (!Number.isFinite(at) || now - at > REFUSAL_SHOWN_MS || at > now + 60_000) return null;
  return { at: r.at, reason: r.reason.slice(0, 300) };
}

/** True when the post's saved Instagram options asked for a trial reel. */
export function usedTrialReel(postChannelMetadata: string | null | undefined): boolean {
  const t = readMeta(postChannelMetadata).igTrial;
  return t === "manual" || t === "auto";
}

async function patch(accountId: string, change: (meta: Record<string, unknown>) => Record<string, unknown>) {
  const row = await db.socialAccount.findUnique({ where: { id: accountId }, select: { metadata: true } });
  if (!row) return;
  await db.socialAccount.update({ where: { id: accountId }, data: { metadata: JSON.stringify(change(readMeta(row.metadata))) } });
}

export async function markTrialReelRefused(accountId: string, reason: string): Promise<void> {
  await patch(accountId, (m) => ({ ...m, trialReelRefused: { at: new Date().toISOString(), reason: reason.slice(0, 300) } }));
}

/** A trial reel got through, so whatever was refused before no longer applies. */
export async function clearTrialReelRefusal(accountId: string): Promise<void> {
  const row = await db.socialAccount.findUnique({ where: { id: accountId }, select: { metadata: true } });
  if (!row || !("trialReelRefused" in readMeta(row.metadata))) return;
  await patch(accountId, (m) => {
    const { trialReelRefused: _gone, ...rest } = m;
    void _gone;
    return rest;
  });
}
