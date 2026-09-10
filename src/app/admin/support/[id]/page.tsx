import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { relativeTime, formatDate } from "@/lib/utils";
import { SupportThread, type ThreadMsg } from "@/components/support-thread";
import { AdminTicketPanel } from "../ticket-panel";

export const metadata: Metadata = { title: "Admin · Ticket" };

export default async function AdminTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requirePlatformAdmin();
  const { id } = await params;

  const ticket = await db.supportTicket.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      org: { select: { name: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { name: true } } },
      },
    },
  });
  if (!ticket) notFound();

  const admins = await db.user.findMany({
    where: { isPlatformAdmin: true, deletedAt: null },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  // The opening message, then every reply — staff sees internal notes too.
  const thread: ThreadMsg[] = [
    {
      id: "opener",
      authorRole: "user",
      authorId: ticket.user.id,
      authorName: ticket.user.name,
      internal: false,
      body: ticket.body,
      createdAt: ticket.createdAt,
    },
    ...ticket.messages.map((m) => ({
      id: m.id,
      authorRole: m.authorRole as "user" | "staff",
      authorId: m.authorId,
      authorName: m.author.name,
      internal: m.internal,
      body: m.body,
      createdAt: m.createdAt,
    })),
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/admin/support" className="text-[13px] text-[var(--primary)] hover:underline">
        &larr; All tickets
      </Link>

      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[17px] font-semibold text-[var(--text)]">{ticket.subject}</h1>
          {ticket.kind === "feedback" && <Badge tone="primary">feedback</Badge>}
          <Badge tone={ticket.status === "resolved" || ticket.status === "closed" ? "success" : "neutral"}>{ticket.status}</Badge>
          <Badge tone={ticket.priority === "high" || ticket.priority === "urgent" ? "danger" : "neutral"}>{ticket.priority}</Badge>
        </div>
        <p className="mt-1 text-[12px] text-[var(--text-subtle)]">
          {ticket.user.name} ({ticket.user.email}) · {ticket.org?.name ?? "no org"} · opened {formatDate(ticket.createdAt)} ·{" "}
          last activity {relativeTime(ticket.lastReplyAt ?? ticket.createdAt)}
        </p>
        {ticket.context && (
          <p className="mt-1 text-[12px] text-[var(--text-subtle)]">
            Sent from <code>{ticket.context}</code>
          </p>
        )}
        {ticket.attachmentUrl && (
          <a
            href={ticket.attachmentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-[13px] text-[var(--primary)] underline"
          >
            View attached screenshot
          </a>
        )}
      </div>

      <SupportThread messages={thread} you={me.id} />

      <AdminTicketPanel
        ticketId={ticket.id}
        status={ticket.status}
        priority={ticket.priority}
        assignedToId={ticket.assignedToId}
        admins={admins.map((a) => ({ id: a.id, label: a.name ?? a.email }))}
      />
    </div>
  );
}
