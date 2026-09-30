import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { InlineEmpty } from "@/components/ui/misc";
import { YouTubeAnalyticsDashboard } from "./youtube-analytics-client";

export const metadata: Metadata = { title: "YouTube Analytics" };

export default async function YouTubeAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const ctx = await requireWorkspace();
  const { account: accountParam } = await searchParams;

  const accounts = await db.socialAccount.findMany({
    where: { workspaceId: ctx.active.workspace.id, platform: "youtube", status: "connected" },
    select: { id: true, displayName: true, handle: true, avatarUrl: true },
    orderBy: { connectedAt: "asc" },
  });

  const selected = accounts.find((a) => a.id === accountParam) ?? accounts[0] ?? null;

  return (
    <>
      <PageHeader
        title="YouTube Analytics"
        description="Views, watch time, subscriber growth and audience breakdown for your connected channel — powered by the YouTube Analytics API."
      />
      {selected ? (
        <YouTubeAnalyticsDashboard
          accounts={accounts.map((a) => ({ id: a.id, label: a.displayName || a.handle }))}
          selectedAccountId={selected.id}
        />
      ) : (
        <InlineEmpty
          title="No YouTube channel connected"
          hint="Connect a YouTube account from Integrations to see its Analytics here."
        />
      )}
    </>
  );
}
