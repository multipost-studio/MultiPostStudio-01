import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { relativeTime, formatDate } from "@/lib/utils";
import { SupportThread, type ThreadMsg } from "@/components/support-thread";
import { queueSide } from "@/lib/support";
import { CustomerReplyBox } from "../support-client";

export const metadata: Metadata = { title: "Support ticket" };

export default async function CustomerTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const ticket = await db.supportTicket.findUnique({
    where: { id },
    include: {
      messages: {
        // The customer never sees internal notes — filtered in the query, not
        // just the view, so they can't arrive over the wire at all.
        where: { internal: false },
        orderBy: { createdAt: "asc" },
        include: { author: { select: { name: true } } },
      },
    },
  });
  // A ticket that isn't theirs is indistinguishable from one that doesn't exist.
  if (!ticket || ticket.userId !== user.id) notFound();

  const side = queueSide(ticket);
  const closed = ticket.status === "resolved" || ticket.status === "closed";

  const thread: ThreadMsg[] = [
    {
      id: "opener",
      authorRole: "user",
      authorId: user.id,
      authorName: user.name,
      internal: false,
      body: ticket.body,
      createdAt: ticket.createdAt,
    },
    ...ticket.messages.map((m) => ({
      id: m.id,
      authorRole: m.authorRole as "user" | "staff",
      authorId: m.authorId,
      authorName: m.author.name,
      internal: false,
      body: m.body,
      createdAt: m.createdAt,
    })),
  ];

  return (
    <div className="space-y-4">
      <Link href="/settings/support" className="text-[13px] text-[var(--primary)] hover:underline">
        &larr; All tickets
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[17px] font-semibold text-[var(--text)]">{ticket.subject}</h1>
          {ticket.kind === "feedback" && <Badge tone="primary">feedback</Badge>}
          <Badge tone={side === "done" ? "success" : side === "them" ? "neutral" : "warning"}>
            {side === "done" ? ticket.status : side === "them" ? "awaiting your reply" : "with support"}
          </Badge>
        </div>
        <p className="mt-1 text-[12px] text-[var(--text-subtle)]">
          Opened {formatDate(ticket.createdAt)} · last activity {relativeTime(ticket.lastReplyAt ?? ticket.createdAt)}
        </p>
      </div>

      <SupportThread messages={thread} you={user.id} />

      <CustomerReplyBox ticketId={ticket.id} closed={closed} />
    </div>
  );
}
