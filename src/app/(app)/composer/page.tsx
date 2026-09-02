import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { StatusBadge } from "@/components/status-badge";
import { PlatformBadge } from "@/components/brand";
import { NewDraftButton } from "./new-draft-button";
import { relativeTime, truncate } from "@/lib/utils";

export const metadata: Metadata = { title: "Posts" };

const FILTERS = ["all", "draft", "awaiting_approval", "approved", "scheduled", "published", "failed", "archived"] as const;

export default async function ComposerListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const ctx = await requireWorkspace();
  const { status } = await searchParams;
  const filter = FILTERS.includes((status ?? "all") as (typeof FILTERS)[number]) ? status ?? "all" : "all";

  const posts = await db.post.findMany({
    where: {
      workspaceId: ctx.active.workspace.id,
      ...(filter !== "all" ? { status: filter } : { status: { not: "archived" } }),
    },
    orderBy: [{ scheduledAt: "asc" }, { updatedAt: "desc" }],
    include: { channels: { include: { channel: true } }, author: { select: { name: true } } },
    take: 100,
  });

  return (
    <>
      <PageHeader
        title="Posts"
        description="Every draft, scheduled and published post in this workspace."
        actions={<NewDraftButton />}
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "all" ? "/composer" : `/composer?status=${f}`}
            className={`rounded-full border px-2.5 py-1 text-[13px] font-medium capitalize ${
              filter === f
                ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
            }`}
          >
            {f.replace(/_/g, " ")}
          </Link>
        ))}
      </div>

      {posts.length === 0 ? (
        <EmptyState
          icon={<Plus size={18} />}
          title="No posts here"
          description="Start a draft or convert an idea from the Ideas board."
          action={<NewDraftButton />}
        />
      ) : (
        <div className="space-y-2">
          {posts.map((p) => (
            <Link key={p.id} href={`/composer/${p.id}`}>
              <Card className="flex items-center gap-3 p-3 transition-colors hover:border-[var(--primary)]">
                <div className="flex -space-x-1.5">
                  {p.channels.slice(0, 4).map((c) => (
                    <PlatformBadge key={c.id} platform={c.platform} size={20} />
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
                    {p.scheduledAt
                      ? `scheduled ${relativeTime(p.scheduledAt)}`
                      : p.publishedAt
                        ? `published ${relativeTime(p.publishedAt)}`
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
