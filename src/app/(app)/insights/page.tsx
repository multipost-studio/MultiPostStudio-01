import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui/misc";
import { InsRegenerate, InsList } from "./insights-client";

export const metadata: Metadata = { title: "AI Insights" };

export default async function InsightsPage() {
  const ctx = await requireWorkspace();
  const insights = await db.insight.findMany({
    where: { workspaceId: ctx.active.workspace.id, dismissed: false },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <PageHeader
        title="AI Insights"
        description="What happened, why it happened, and what to do next — generated from your last 90 days."
        actions={<InsRegenerate />}
      />
      {insights.length === 0 ? (
        <EmptyState
          title="No insights yet"
          description="Publish a handful of posts, then generate insights to see patterns and recommendations."
          action={<InsRegenerate />}
        />
      ) : (
        <InsList
          insights={insights.map((i) => ({
            id: i.id,
            category: i.category,
            severity: i.severity,
            what: i.what,
            why: i.why,
            action: i.action,
            metricDelta: i.metricDelta,
          }))}
        />
      )}
    </>
  );
}
