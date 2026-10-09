import { requireAdminPermission } from "@/lib/session";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { buildRuleSet, DEFAULT_RULES } from "@/lib/platform-rules";
import { rowToOverride } from "@/lib/platform-rules-db";
import { PlatformRulesClient, type RuleRow, type RevisionRow } from "./platform-rules-client";

export const metadata: Metadata = { title: "Admin · Platform Rules" };
export const dynamic = "force-dynamic";

export default async function AdminPlatformRulesPage() {
  await requireAdminPermission("settings.view");
  let rows: RuleRow[] = DEFAULT_RULES.map((r) => ({ ...r, edited: false }));
  let revisions: RevisionRow[] = [];
  let loadError: string | null = null;

  try {
    const [overrideRows, revs] = await Promise.all([
      db.platformRule.findMany(),
      db.platformRuleRevision.findMany({ orderBy: { changedAt: "desc" }, take: 40 }),
    ]);
    const overrides = overrideRows.map(rowToOverride);
    const edited = new Set(overrides.map((o) => o.id));
    rows = buildRuleSet(DEFAULT_RULES, overrides).rules.map((r) => ({ ...r, edited: edited.has(r.id) }));

    const adminIds = [...new Set(revs.map((r) => r.changedBy).filter((x): x is string => !!x))];
    const admins = adminIds.length ? await db.user.findMany({ where: { id: { in: adminIds } }, select: { id: true, name: true } }) : [];
    const names = new Map(admins.map((a) => [a.id, a.name]));
    revisions = revs.map((r) => ({
      id: r.id,
      ruleId: r.ruleId,
      platform: r.platform,
      by: r.changedBy ? (names.get(r.changedBy) ?? "Admin") : "System",
      at: r.changedAt.toISOString(),
      reason: r.reason,
      version: r.version,
      oldValue: r.oldValue,
      newValue: r.newValue,
    }));
  } catch {
    loadError = "Couldn't load saved changes. Check that the latest database migration has been applied. Showing the built-in defaults, read-only.";
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Platform Rules</h1>
        <p className="mt-1 text-[14px] text-[var(--text-muted)]">
          The limits the composer, scheduler, queue and publisher all check against. Edit a value here and it applies everywhere within about 30 seconds, with no deploy. Every change is
          recorded with who, why and the source.
        </p>
      </div>
      {loadError && (
        <div role="alert" className="rounded-[var(--radius-md)] border border-[var(--danger)]/40 bg-[var(--danger-soft)] px-3 py-2 text-[13px] text-[var(--danger)]">
          {loadError}
        </div>
      )}
      <PlatformRulesClient rows={rows} revisions={revisions} readOnly={loadError != null} />
    </div>
  );
}
