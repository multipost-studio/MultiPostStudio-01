import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { parseJson } from "@/lib/utils";
import { InboxView } from "./inbox-view";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage() {
  const ctx = await requireWorkspace();
  const wsId = ctx.active.workspace.id;

  const [conversations, savedReplies, members] = await Promise.all([
    db.conversation.findMany({
      where: { workspaceId: wsId },
      orderBy: [{ status: "asc" }, { priority: "desc" }, { lastMessageAt: "desc" }],
      take: 50,
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          // Egress: thread bodies capped — pathological 10k-message threads
          // no longer transfer in full on every inbox load.
          take: 100,
          select: { id: true, direction: true, authorName: true, body: true, createdAt: true },
        },
        assignee: { select: { id: true, name: true } },
      },
    }),
    db.savedReply.findMany({ where: { workspaceId: wsId }, orderBy: { title: "asc" }, take: 100 }),
    db.workspaceMember.findMany({ where: { workspaceId: wsId }, take: 200, include: { user: { select: { id: true, name: true } } } }),
  ]);

  return (
    <InboxView
      conversations={conversations.map((c) => ({
        id: c.id,
        platform: c.platform,
        type: c.type,
        authorName: c.authorName,
        authorHandle: c.authorHandle,
        preview: c.preview,
        status: c.status,
        sentiment: c.sentiment,
        priority: c.priority,
        rating: c.rating,
        labels: parseJson<string[]>(c.labels, []),
        assignee: c.assignee ? { id: c.assignee.id, name: c.assignee.name } : null,
        lastMessageAt: c.lastMessageAt.toISOString(),
        messages: c.messages.map((m) => ({
          id: m.id,
          direction: m.direction,
          authorName: m.authorName,
          body: m.body,
          createdAt: m.createdAt.toISOString(),
        })),
      }))}
      savedReplies={savedReplies.map((s) => ({ id: s.id, title: s.title, body: s.body }))}
      members={members.map((m) => ({ id: m.user.id, name: m.user.name }))}
    />
  );
}
