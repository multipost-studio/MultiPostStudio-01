import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Scoped pauses ("kill switches"). A switch pauses one kind of work (AI features, or publishing) for everyone, for one
 * organization, or for one provider (an AI provider, or a social platform). Staff create them on /admin/kill-switches
 * with a reason and, preferably, an expiry; they end by being revoked or by expiring. The history is kept.
 *
 * Enforced where the work actually happens: the AI orchestrator (before a provider is called) and the publish queue
 * (before a job is claimed). Paused publishing is held, not failed: the job stays queued and is retried later.
 *
 * Reading is cheap (a 15 second cache) and never throws. If the table cannot be read, the last good answer is used;
 * with no earlier answer nothing is paused, because a database hiccup must not stop every customer's publishing.
 */
export const KILL_KINDS = [
  { id: "ai", label: "AI features" },
  { id: "publishing", label: "Publishing" },
] as const;
export type KillKind = (typeof KILL_KINDS)[number]["id"];

export const SCOPE_TYPES = [
  { id: "platform", label: "Everyone" },
  { id: "org", label: "One organization" },
  { id: "provider", label: "One provider or platform" },
] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number]["id"];

export const isKillKind = (v: unknown): v is KillKind => KILL_KINDS.some((k) => k.id === v);
export const isScopeType = (v: unknown): v is ScopeType => SCOPE_TYPES.some((s) => s.id === v);

export type SwitchRow = { id: string; kind: string; scopeType: string; scopeValue: string | null; expiresAt: Date | null; revokedAt: Date | null };
export type Ctx = { orgId?: string | null; providers?: readonly string[] };

export function isLive(sw: SwitchRow, now: Date): boolean {
  return !sw.revokedAt && (!sw.expiresAt || sw.expiresAt.getTime() > now.getTime());
}

/** Does this switch pause this kind of work in this context? */
export function applies(sw: SwitchRow, kind: KillKind, ctx: Ctx, now: Date = new Date()): boolean {
  if (sw.kind !== kind || !isLive(sw, now)) return false;
  if (sw.scopeType === "platform") return true;
  if (sw.scopeType === "org") return !!sw.scopeValue && ctx.orgId === sw.scopeValue;
  if (sw.scopeType === "provider") return !!sw.scopeValue && (ctx.providers ?? []).includes(sw.scopeValue);
  return false;
}

/** What a customer is told: never the internal reason. */
export const PAUSED_MESSAGE: Record<KillKind, string> = {
  ai: "AI features are paused by MultiPost Studio for now and will be back soon.",
  publishing: "Publishing is paused by MultiPost Studio for now. Your post stays scheduled and goes out when it is lifted.",
};

const TTL_MS = 15_000;
let cache: { at: number; rows: SwitchRow[] } | null = null;

export function invalidateKillSwitches(): void {
  cache = null;
}

async function liveSwitches(now: Date): Promise<SwitchRow[]> {
  if (cache && now.getTime() - cache.at < TTL_MS) return cache.rows;
  try {
    const rows = await db.killSwitch.findMany({
      where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      select: { id: true, kind: true, scopeType: true, scopeValue: true, expiresAt: true, revokedAt: true },
      take: 200,
    });
    cache = { at: now.getTime(), rows };
    return rows;
  } catch (err) {
    logger.warn({ err }, "kill switches unreadable; using the last known state");
    return cache?.rows ?? [];
  }
}

/**
 * The customer-facing message if `kind` is paused for this context, else null. `orgId` may be a function so that the
 * organization is only looked up when an organization-scoped switch exists at all.
 */
export async function pausedMessage(kind: KillKind, ctx: { orgId?: string | null | (() => Promise<string | null>); providers?: readonly string[] }, now: Date = new Date()): Promise<string | null> {
  const rows = (await liveSwitches(now)).filter((r) => r.kind === kind);
  if (rows.length === 0) return null;
  let orgId: string | null | undefined;
  if (rows.some((r) => r.scopeType === "org")) orgId = typeof ctx.orgId === "function" ? await ctx.orgId().catch(() => null) : ctx.orgId;
  const resolved: Ctx = { orgId, providers: ctx.providers };
  return rows.some((r) => applies(r, kind, resolved, now)) ? PAUSED_MESSAGE[kind] : null;
}
