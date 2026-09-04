import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { parseJson, relativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { RepNew, RepActions } from "./reports-client";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const ctx = await requireWorkspace();
  const { new: openNew } = await searchParams;

  const reports = await db.report.findMany({
    where: { workspaceId: ctx.active.workspace.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <PageHeader
        title="Report Builder"
        description="Custom, white-label reports. Export to PDF/CSV, share a link, or schedule delivery."
        actions={<RepNew open={openNew === "1"} />}
      />

      {reports.length === 0 ? (
        <EmptyState
          title="No reports yet"
          description="Build a report from analytics widgets and share it with clients or stakeholders."
          action={<RepNew />}
        />
      ) : (
        <div className="space-y-3">
          {reports.map((r) => {
            const cfg = parseJson<{ dateRange: string; widgets: string[]; branding?: { logo?: boolean } }>(r.config, {
              dateRange: "last_30_days",
              widgets: [],
            });
            return (
              <div key={r.id} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[15px] font-semibold text-[var(--text)]">{r.name}</p>
                    <p className="text-[13px] text-[var(--text-subtle)]">
                      {cfg.widgets.length} widgets · {cfg.dateRange.replace(/_/g, " ")}
                      {cfg.branding?.logo && " · white-label"}
                      {r.lastRunAt && ` · generated ${relativeTime(r.lastRunAt)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.schedule && r.schedule !== "none" && <Badge tone="info">{r.schedule}</Badge>}
                    {r.shareToken && <Badge tone="success">Shared</Badge>}
                  </div>
                </div>
                <div className="mt-3">
                  <RepActions
                    id={r.id}
                    schedule={r.schedule ?? "none"}
                    shared={!!r.shareToken}
                    shareToken={r.shareToken}
                    days={{ last_7_days: 7, last_30_days: 30, last_90_days: 90 }[cfg.dateRange] ?? 30}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
