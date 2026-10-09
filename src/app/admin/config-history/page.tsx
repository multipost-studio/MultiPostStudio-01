import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { getStaffPermissions, requireAdminPermission } from "@/lib/session";
import { CONFIG_REGISTRY } from "@/lib/config-registry";
import { describeChange, prettyConfig } from "@/lib/config-diff";
import { formatDate, relativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { RestoreButton } from "./restore-button";

export const metadata: Metadata = { title: "Admin · Config history" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;

export default async function ConfigHistoryPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  await requireAdminPermission("config.view");
  const perms = await getStaffPermissions();
  const { key } = await searchParams;

  // A person sees the history of the configs they may view; the rest are not listed at all.
  const visible = CONFIG_REGISTRY.filter((c) => perms.has(c.view));
  const chosen = visible.find((c) => c.key === key);
  const keys = (chosen ? [chosen] : visible).map((c) => c.key);

  const revisions = await db.configRevision
    .findMany({ where: { key: { in: keys } }, orderBy: { createdAt: "desc" }, take: PAGE_SIZE })
    // The table not being migrated yet must show an explanation, not an error page.
    .catch(() => null);
  const actorIds = [...new Set((revisions ?? []).map((r) => r.actorId).filter((x): x is string => !!x))];
  const actors = actorIds.length ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } }) : [];
  const actorName = (id: string | null) => (id ? actors.find((a) => a.id === id)?.name || actors.find((a) => a.id === id)?.email || "Former staff member" : "System");
  const current = await db.systemSetting.findMany({ where: { key: { in: keys } }, select: { key: true, value: true } });
  const currentValue = (k: string) => current.find((c) => c.key === k)?.value ?? "";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Config history</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-[var(--text-muted)]">
          Every save and reset of branding, footer, festival themes, review settings and health probe settings keeps the previous version here. Restoring a version goes through the same validation as editing it, and is itself recorded.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-[13px]">
        <Link href="/admin/config-history" className={`rounded-full border px-3 py-1 ${!chosen ? "border-[var(--primary)] text-[var(--text)]" : "border-[var(--border)] text-[var(--text-muted)]"}`}>
          All
        </Link>
        {visible.map((c) => (
          <Link key={c.key} href={`/admin/config-history?key=${c.key}`} className={`rounded-full border px-3 py-1 ${chosen?.key === c.key ? "border-[var(--primary)] text-[var(--text)]" : "border-[var(--border)] text-[var(--text-muted)]"}`}>
            {c.label}
          </Link>
        ))}
      </div>

      {revisions === null ? (
        <p role="alert" className="rounded-[var(--radius-md)] border border-[var(--warning)] p-3 text-[14px]">
          History isn&apos;t available yet. If this is a new deploy, check that the latest database migration (admin governance) has been applied. Saving configuration still works meanwhile.
        </p>
      ) : revisions.length === 0 ? (
        <p className="text-[14px] text-[var(--text-muted)]">No changes recorded yet. History starts with the next save.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)]">
          {revisions.map((r) => {
            const entry = CONFIG_REGISTRY.find((c) => c.key === r.key)!;
            const isCurrent = currentValue(r.key) === r.after;
            return (
              <li key={r.id} className="space-y-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-medium text-[var(--text)]">{entry.label}</span>
                      {isCurrent && <Badge tone="success">current</Badge>}
                      {r.restoredFromId && <Badge tone="info">restore</Badge>}
                    </div>
                    <p className="text-[13px] text-[var(--text-muted)]">
                      {describeChange(r.before, r.after)} · {actorName(r.actorId)} · <span title={formatDate(r.createdAt)}>{relativeTime(r.createdAt)}</span>
                      {r.reason ? ` · "${r.reason}"` : ""}
                    </p>
                  </div>
                  {perms.has(entry.manage) && !isCurrent && <RestoreButton revisionId={r.id} label={entry.label} />}
                </div>
                <details>
                  <summary className="cursor-pointer text-[12.5px] text-[var(--text-muted)]">View this version</summary>
                  <pre className="mt-2 max-h-72 overflow-auto rounded-[var(--radius-md)] bg-[var(--bg)] p-3 text-[12px] leading-relaxed text-[var(--text)]">{prettyConfig(r.after)}</pre>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
