import type { Metadata } from "next";
import Link from "next/link";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { PlatformBadge } from "@/components/brand";
import { Avatar } from "@/components/ui/misc";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Comments" };

export default async function CommentsPage() {
  const ctx = await requireWorkspace();
  const rows = await db.conversation.findMany({
    where: { workspaceId: ctx.active.workspace.id, type: { in: ["comment", "reply", "mention"] } },
    orderBy: { lastMessageAt: "desc" },
    include: { channel: true },
    take: 100,
  });

  return (
    <>
      <PageHeader
        title="Comments"
        description="Every comment, reply and mention on your published content. Respond from the Inbox."
        actions={
          <Link href="/inbox" className="text-[14px] text-[var(--primary)] hover:underline">
            Open full inbox →
          </Link>
        }
      />
      {rows.length === 0 ? (
        <EmptyState title="No comments yet" description="When people comment on your posts, they'll show up here." />
      ) : (
        <div className="space-y-2">
          {rows.map((c) => (
            <Link
              key={c.id}
              href="/inbox"
              className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3 hover:border-[var(--primary)]"
            >
              <Avatar name={c.authorName} size={30} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-medium text-[var(--text)]">{c.authorName}</span>
                  <PlatformBadge platform={c.platform} size={14} />
                  <Badge tone="neutral">{c.type}</Badge>
                  {c.sentiment === "negative" && <Badge tone="danger">Negative</Badge>}
                  <span className="ml-auto text-[12px] text-[var(--text-subtle)]">{relativeTime(c.lastMessageAt)}</span>
                </div>
                <p className="mt-1 text-[14px] text-[var(--text-muted)]">{c.preview}</p>
              </div>
              {c.status === "open" && <Badge tone="warning" dot>Open</Badge>}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
