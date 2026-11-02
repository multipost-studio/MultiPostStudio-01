import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { StatusBadge } from "@/components/status-badge";
import { PlatformBadge } from "@/components/brand";
import { NewDraftButton } from "./new-draft-button";
import { relativeTime, truncate } from "@/lib/utils";

export const metadata: Metadata = { title: "Posts" };

const FILTERS = ["all", "draft", "awaiting_approval", "approved", "scheduled", "published", "failed", "archived"] as const;
/** Always shown. The rest appear only when there is something in them (or they are the open filter), so a new workspace sees four chips, not eight. */
const CORE_FILTERS = new Set<string>(["all", "draft", "scheduled", "published"]);

export default async function ComposerListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const ctx = await requireWorkspace();
  const { status } = await searchParams;
  const filter = FILTERS.includes((status ?? "all") as (typeof FILTERS)[number]) ? status ?? "all" : "all";

  // Counts for the chips, in one query. "all" excludes archived, like the list.
  const grouped = await db.post.groupBy({ by: ["status"], where: { workspaceId: ctx.active.workspace.id }, _count: { _all: true } });
  const counts: Record<string, number> = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
  counts.all = grouped.filter((g) => g.status !== "archived").reduce((n, g) => n + g._count._all, 0);
  const visibleFilters = FILTERS.filter((f) => CORE_FILTERS.has(f) || f === filter || (counts[f] ?? 0) > 0);

  const posts = await db.post.findMany({
    where: {
      workspaceId: ctx.active.workspace.id,
      ...(filter !== "all" ? { status: filter } : { status: { not: "archived" } }),
    },
    // Newest activity first, so the draft you just made is at the top. The Scheduled filter lists what goes out next first.
    orderBy: filter === "scheduled" ? [{ scheduledAt: "asc" }, { updatedAt: "desc" }] : [{ updatedAt: "desc" }],
    // Egress: list renders id/title/status/timestamps + first channel body
    // as title fallback. Full Post rows + full SocialChannel rows dropped.
    select: {
      id: true,
      title: true,
      status: true,
      scheduledAt: true,
      publishedAt: true,
      updatedAt: true,
      author: { select: { name: true } },
      channels: { select: { id: true, platform: true, body: true, channelId: true, channelLabel: true } },
    },
    take: 100,
  });

  return (
    <>
      <PageHeader
        title="Posts"
        description="Every draft, scheduled and published post in this workspace, newest first."
        wash="a"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/composer/grid" className="text-[13px] font-medium text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text)] hover:underline">
              Grid view
            </Link>
            <NewDraftButton />
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {visibleFilters.map((f) => (
          <Link
            key={f}
            href={f === "all" ? "/composer" : `/composer?status=${f}`}
            className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium capitalize ${
              filter === f
                ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
            }`}
          >
            {f.replace(/_/g, " ")}
            {(counts[f] ?? 0) > 0 && <span className="ml-1.5 text-[12px] font-normal opacity-70">{counts[f]}</span>}
          </Link>
        ))}
      </div>

      {posts.length === 0 ? (
        <EmptyState
          icon={<Plus size={18} />}
          title={filter === "all" ? "No posts created yet" : `No ${filter.replace(/_/g, " ")} posts`}
          description={
            filter === "all"
              ? "Start authoring content to schedule across your connected channels or draft variants in the AI Content Studio."
              : `There are currently no posts matching the "${filter.replace(/_/g, " ")}" status in this workspace.`
          }
          action={<NewDraftButton />}
        />
      ) : (
        <div className="space-y-2">
          {posts.map((p) => (
            <Link key={p.id} href={`/composer/${p.id}`}>
              <Card className="flex items-center gap-3 p-3 transition-colors hover:border-[var(--primary)]">
                <div className="flex -space-x-1.5">
                  {p.channels.slice(0, 4).map((c) => (
                    <span key={c.id} title={c.channelId ? undefined : `${c.channelLabel ?? c.platform} (since disconnected)`} className={c.channelId ? undefined : "opacity-60"}>
                      <PlatformBadge platform={c.platform} size={20} />
                    </span>
                  ))}
                  {p.channels.length === 0 && (
                    <span className="text-[12px] text-[var(--text-subtle)]">No channels</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-[var(--text)]">
                    {p.title || truncate(p.channels[0]?.body || "Untitled post", 70)}
                  </p>
                  <p className="text-[12px] text-[var(--text-subtle)]">
                    {p.author.name} ·{" "}
                    {/* Say what the badge says: a published post was published, not "scheduled". */}
                    {p.status === "published" && (p.publishedAt ?? p.scheduledAt)
                      ? `published ${relativeTime((p.publishedAt ?? p.scheduledAt)!)}`
                      : p.scheduledAt
                        ? `scheduled ${relativeTime(p.scheduledAt)}`
                        : `updated ${relativeTime(p.updatedAt)}`}
                  </p>
                </div>
                <StatusBadge status={p.status} />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
