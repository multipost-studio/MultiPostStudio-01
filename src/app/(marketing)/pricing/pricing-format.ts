import { ENTITLEMENT_GROUPS } from "@/lib/constants";

/** The numbers a plan card leads with. 0 (or less) means "no cap", matching every limit in Plan. */
export type PlanLimits = {
  workspaces: number;
  channels: number;
  users: number;
  scheduled: number;
  aiCredits: number;
  storageMb: number;
};

const num = (n: number) => n.toLocaleString("en-US");

export function fmtLimit(n: number): string {
  return n <= 0 ? "Unlimited" : num(n);
}

/** Storage is stored in MB; show GB from 1,000 MB up (the catalog uses decimal sizes: 5,000 MB is "5 GB"). */
export function fmtStorage(mb: number): string {
  if (mb <= 0) return "Unlimited";
  if (mb >= 1000) return `${Number((mb / 1000).toFixed(1))} GB`;
  return `${num(mb)} MB`;
}

export function limitStats(l: PlanLimits): { value: string; label: string }[] {
  return [
    { value: fmtLimit(l.workspaces), label: l.workspaces === 1 ? "workspace" : "workspaces" },
    { value: fmtLimit(l.channels), label: "channels" },
    { value: fmtLimit(l.users), label: l.users === 1 ? "team member" : "team members" },
    { value: fmtLimit(l.scheduled), label: "scheduled posts" },
    { value: fmtLimit(l.aiCredits), label: "AI credits / mo" },
    { value: fmtStorage(l.storageMb), label: "media storage" },
  ];
}

// Marketing bullets that restate a number already shown in the limits grid.
const LIMIT_BULLET = /\b(workspaces?|channels?|ai credits?|credits\/mo|seats?|storage|team members?)\b/i;

/** The plan's marketing bullets minus the ones that just repeat a limit, so the list shows what you *get*, not the numbers above it. */
export function planHighlights(features: readonly string[]): string[] {
  return features.filter((f) => !LIMIT_BULLET.test(f));
}

/** Who each plan is for. Keyed by plan key; custom plans simply have none. */
export const PLAN_BLURB: Record<string, string> = {
  free: "Trying MultiPost Studio, or running a single brand.",
  pro: "Solo creators and small brands that publish every week.",
  team: "Teams that need approvals, roles and reporting.",
  agency: "Agencies running several client brands, with portals and white-label reports.",
  enterprise: "Large organisations that need custom channels, SSO and dedicated support.",
};

const LABELS = new Map<string, string>(ENTITLEMENT_GROUPS.flatMap((g) => g.items.map(([k, label]) => [k, label] as const)));

/**
 * What every plan gets, from the entitlements of the entry plan (never a
 * hand-kept list). Individual platform entitlements collapse into one line.
 */
export function everyPlanItems(entitlements: readonly string[]): string[] {
  const platforms = entitlements.filter((e) => e.startsWith("platform_")).map((e) => LABELS.get(e) ?? e);
  const rest = entitlements.filter((e) => !e.startsWith("platform_")).map((e) => LABELS.get(e)).filter((l): l is string => !!l);
  const items = [...rest];
  if (platforms.length) items.unshift(`Publish to ${platforms.length} platforms: ${platforms.join(", ")}`);
  return items;
}

/** Savings of paying yearly, in the same currency units as the prices. Never negative. */
export function annualSaving(monthly: number, annual: number): number {
  return Math.max(0, monthly * 12 - annual);
}
