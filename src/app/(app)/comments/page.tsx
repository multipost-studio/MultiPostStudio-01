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

import { Button } from "@/components/ui/button";

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
          <Link href="/inbox" className="text-[14px] text-[var(--primary)] font-medium hover:underline">
            Open full inbox →
          </Link>
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No incoming comments yet"
          description="Comments, replies, and mentions from your published posts across connected channels will stream in here automatically."
          action={
            <Button asChild size="sm" variant="secondary">
              <Link href="/integrations">Manage Connected Channels</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {rows.map((c) => (
            <Link
              key={c.id}
              href={`/inbox?id=${c.id}`}
              className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3 hover:border-[var(--primary)] transition-colors"
            >
              <Avatar name={c.authorName} size={30} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-medium text-[var(--text)]">{c.authorName}</span>
                  <PlatformBadge platform={c.platform} size={14} />
                  <Badge tone="neutral">{c.type}</Badge>
                  {c.priority >= 2 && <Badge tone="warning">P{c.priority}</Badge>}
                  {c.sentiment === "negative" ? (
                    <Badge tone="danger">Negative</Badge>
                  ) : c.sentiment === "positive" ? (
                    <Badge tone="success">Positive</Badge>
                  ) : null}
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
