import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui/misc";
import { OpportunityCard } from "./opportunity-card";

export const metadata: Metadata = { title: "Opportunities" };

export default async function OpportunitiesPage() {
  const ctx = await requireWorkspace();
  const opportunities = await db.opportunity.findMany({
    where: { workspaceId: ctx.active.workspace.id },
    orderBy: [{ status: "asc" }, { score: "desc" }],
  });

  const open = opportunities.filter((o) => o.status === "open");
  const other = opportunities.filter((o) => o.status !== "open");

  return (
    <>
      <PageHeader
        title="Content Opportunities"
        description="Gap analysis across topics, formats and timing — ranked by Content Opportunity Score."
      />

      {opportunities.length === 0 ? (
        <EmptyState title="No opportunities found" description="MultiPost Studio surfaces gaps once it has enough content history to compare." />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 md:grid-cols-2">
            {open.map((o) => (
              <OpportunityCard key={o.id} o={{ id: o.id, title: o.title, rationale: o.rationale, type: o.type, score: o.score, status: o.status }} />
            ))}
          </div>
          {other.length > 0 && (
            <div>
              <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
                Planned & dismissed
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {other.map((o) => (
                  <OpportunityCard key={o.id} o={{ id: o.id, title: o.title, rationale: o.rationale, type: o.type, score: o.score, status: o.status }} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
