import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui/misc";
import { relativeTime } from "@/lib/utils";
import { AutomNew, AutomToolbar, AutomRow } from "./automations-client";

export const metadata: Metadata = { title: "Automations" };

const TRIGGER_LABEL: Record<string, string> = {
  post_published: "A post is published",
  high_engagement: "A post gets high engagement",
  threshold_reached: "A post reaches a threshold",
  draft_created: "A draft is created",
  approval_requested: "Approval is requested",
};
const ACTION_LABEL: Record<string, string> = {
  notify: "Send a notification",
  tag_high_performer: "Tag it as high-performing",
  recommend_repurpose: "Recommend repurposing",
  run_ai_optimize: "Run AI optimization",
  assign: "Assign to a teammate",
};

export default async function AutomationsPage() {
  const ctx = await requireWorkspace();
  const automations = await db.automation.findMany({
    where: { workspaceId: ctx.active.workspace.id },
    orderBy: { createdAt: "desc" },
    include: { runs: { orderBy: { createdAt: "desc" }, take: 3 } },
  });

  return (
    <>
      <PageHeader
        title="Automation Engine"
        description="WHEN something happens, THEN Cadence acts. Runs continuously in the background."
        actions={<AutomToolbar />}
      />

      {automations.length === 0 ? (
        <EmptyState
          title="No automations yet"
          description="Create a rule like: WHEN a post is published, THEN notify the team."
          action={<AutomNew />}
        />
      ) : (
        <div className="space-y-3">
          {automations.map((a) => (
            <div key={a.id} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[15px] font-semibold text-[var(--text)]">{a.name}</p>
                <AutomRow id={a.id} enabled={a.enabled} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
                <span className="rounded-full bg-[var(--bg-sunken)] px-2 py-0.5 text-[var(--text-muted)]">
                  WHEN {TRIGGER_LABEL[a.triggerType] ?? a.triggerType}
                </span>
                <span className="text-[var(--text-subtle)]">→</span>
                <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[var(--primary)]">
                  THEN {ACTION_LABEL[a.actionType] ?? a.actionType}
                </span>
              </div>
              <p className="mt-2 text-[12px] text-[var(--text-subtle)]">
                Ran {a.runCount}× · {a.lastRunAt ? `last ${relativeTime(a.lastRunAt)}` : "never run"}
              </p>
              {a.runs.length > 0 && (
                <ul className="mt-2 space-y-0.5 border-l-2 border-[var(--border)] pl-2.5 text-[12px] text-[var(--text-muted)]">
                  {a.runs.map((r) => (
                    <li key={r.id}>
                      <span className={r.status === "success" ? "text-[var(--success)]" : "text-[var(--text-subtle)]"}>{r.status}</span>
                      {" · "}
                      {r.detail} · {relativeTime(r.createdAt)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
