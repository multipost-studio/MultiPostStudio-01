"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser, requirePlatformAdmin } from "@/lib/session";
import { notify, logAudit } from "@/lib/events";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import {
  TICKET_STATUSES,
  TICKET_PRIORITIES,
  type TicketStatus,
  type TicketPriority,
} from "@/lib/support";

/**
 * Support ticket conversations.
 *
 * These actions serve both sides. The caller's role is derived, never trusted:
 * a platform admin is "staff", the ticket's opener is "user", anyone else is
 * refused. `internal` is honoured only for staff, so a customer can never post
 * a note that hides from themselves or reach another customer's thread.
 */

type Reply = { ok: boolean; error?: string; message?: string };

const MAX_BODY = 5000;

/** Resolve who the caller is, relative to a ticket. */
async function actorFor(ticketId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to continue" as const };

  const ticket = await db.supportTicket.findUnique({
    where: { id: ticketId },
    select: { id: true, userId: true, status: true, assignedToId: true, subject: true },
  });
  if (!ticket) return { error: "Ticket not found" as const };

  if (user.isPlatformAdmin) return { user, ticket, role: "staff" as const };
  if (ticket.userId === user.id) return { user, ticket, role: "user" as const };
  return { error: "You don't have access to this ticket" as const };
}

/** Every platform admin — the fallback recipient for an unassigned ticket. */
async function platformAdminIds(exceptId?: string): Promise<string[]> {
  const admins = await db.user.findMany({
    where: { isPlatformAdmin: true, deletedAt: null },
    select: { id: true },
  });
  return admins.map((a) => a.id).filter((id) => id !== exceptId);
}

/* ---------------- customer: open a ticket ---------------- */

export async function openSupportTicketAction(_prev: unknown, formData: FormData): Promise<Reply> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to continue" };

  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (subject.length < 3) return { ok: false, error: "Give the request a short subject." };
  if (body.length < 10) return { ok: false, error: "Add a bit more detail so we can help." };
  if (body.length > MAX_BODY) return { ok: false, error: "That's longer than we can accept — trim it a little." };

  try {
    await enforceRateLimit(`support-open:${user.id}`, 5, 3_600_000);
  } catch (e) {
    if (e instanceof RateLimitError) {
      return { ok: false, error: "You've opened a few tickets recently — give us time to reply first." };
    }
    throw e;
  }

  // orgId is best-effort context for triage, not an access boundary.
  const membership = await db.membership.findFirst({
    where: { userId: user.id, status: "active" },
    select: { orgId: true },
  });

  const ticket = await db.supportTicket.create({
    data: {
      userId: user.id,
      orgId: membership?.orgId ?? null,
      subject: subject.slice(0, 140),
      body,
      kind: "support",
      status: "open",
      lastReplyRole: "user",
      lastReplyAt: new Date(),
    },
  });

  for (const adminId of await platformAdminIds(user.id)) {
    await notify({
      userId: adminId,
      type: "system",
      title: "New support ticket",
      body: `${user.name ?? user.email}: ${subject.slice(0, 80)}`,
      linkUrl: `/admin/support/${ticket.id}`,
    }).catch((err) => logger.error({ err }, "support: admin notify failed"));
  }

  revalidatePath("/settings/support");
  return { ok: true, message: "Sent — we'll reply by email and here." };
}

/* ---------------- either side: reply ---------------- */

export async function replyToTicketAction(
  ticketId: string,
  bodyRaw: string,
  opts?: { internal?: boolean },
): Promise<Reply> {
  const a = await actorFor(ticketId);
  if ("error" in a) return { ok: false, error: a.error };
  const { user, ticket, role } = a;

  const body = bodyRaw.trim();
  if (body.length < 1) return { ok: false, error: "Write a message first." };
  if (body.length > MAX_BODY) return { ok: false, error: "That's longer than we can accept — trim it a little." };

  // Only staff can post an internal note; for a customer the flag is ignored.
  const internal = role === "staff" && opts?.internal === true;

  try {
    await enforceRateLimit(`support-reply:${user.id}`, 30, 3_600_000);
  } catch (e) {
    if (e instanceof RateLimitError) return { ok: false, error: "Slow down a moment, then try again." };
    throw e;
  }

  await db.supportMessage.create({
    data: { ticketId, authorId: user.id, authorRole: role, internal, body },
  });

  // An internal note changes nothing the customer sees and pings nobody.
  if (!internal) {
    const reopened = role === "user" && (ticket.status === "resolved" || ticket.status === "closed");
    await db.supportTicket.update({
      where: { id: ticketId },
      data: {
        lastReplyRole: role,
        lastReplyAt: new Date(),
        ...(reopened ? { status: "open" } : {}),
        // A staff reply moves it to "waiting on them" unless already closed.
        ...(role === "staff" && ticket.status === "open" ? { status: "pending" } : {}),
      },
    });

    if (role === "staff") {
      await notify({
        userId: ticket.userId,
        type: "system",
        title: "Support replied",
        body: `Re: ${ticket.subject.slice(0, 80)}`,
        linkUrl: `/settings/support/${ticketId}`,
      }).catch((err) => logger.error({ err }, "support: user notify failed"));
    } else {
      const recipients = ticket.assignedToId
        ? [ticket.assignedToId]
        : await platformAdminIds(user.id);
      for (const rid of recipients) {
        await notify({
          userId: rid,
          type: "system",
          title: "Support ticket reply",
          body: `${user.name ?? user.email}: ${ticket.subject.slice(0, 80)}`,
          linkUrl: `/admin/support/${ticketId}`,
        }).catch((err) => logger.error({ err }, "support: admin notify failed"));
      }
    }
  }

  revalidatePath(`/admin/support/${ticketId}`);
  revalidatePath(`/settings/support/${ticketId}`);
  return { ok: true };
}

/* ---------------- staff only ---------------- */

export async function assignTicketAction(ticketId: string, adminId: string): Promise<Reply> {
  const staff = await requirePlatformAdmin();
  const to = adminId || null;

  if (to) {
    const target = await db.user.findFirst({ where: { id: to, isPlatformAdmin: true }, select: { id: true, name: true, email: true } });
    if (!target) return { ok: false, error: "That person isn't a platform admin." };
    await db.supportTicket.update({ where: { id: ticketId }, data: { assignedToId: to } });
    if (to !== staff.id) {
      await notify({
        userId: to,
        type: "system",
        title: "Ticket assigned to you",
        body: `${staff.name ?? "An admin"} assigned you a support ticket.`,
        linkUrl: `/admin/support/${ticketId}`,
      }).catch(() => {});
    }
  } else {
    await db.supportTicket.update({ where: { id: ticketId }, data: { assignedToId: null } });
  }
  await logAudit({ actorId: staff.id, action: "support.assigned", targetType: "supportTicket", targetId: ticketId });
  revalidatePath(`/admin/support/${ticketId}`);
  revalidatePath("/admin/support");
  return { ok: true };
}

export async function setTicketPriorityAction(ticketId: string, priority: TicketPriority): Promise<Reply> {
  const staff = await requirePlatformAdmin();
  if (!TICKET_PRIORITIES.includes(priority)) return { ok: false, error: "Unknown priority" };
  await db.supportTicket.update({ where: { id: ticketId }, data: { priority } });
  await logAudit({ actorId: staff.id, action: "support.priority", targetType: "supportTicket", targetId: ticketId, metadata: { priority } });
  revalidatePath(`/admin/support/${ticketId}`);
  revalidatePath("/admin/support");
  return { ok: true };
}

export async function setTicketStatusAction(ticketId: string, status: TicketStatus): Promise<Reply> {
  const staff = await requirePlatformAdmin();
  if (!TICKET_STATUSES.includes(status)) return { ok: false, error: "Unknown status" };

  await db.supportTicket.update({ where: { id: ticketId }, data: { status } });
  await logAudit({ actorId: staff.id, action: "support.status", targetType: "supportTicket", targetId: ticketId, metadata: { status } });

  // Tell the customer when their ticket is closed off, so it doesn't just go quiet.
  if (status === "resolved" || status === "closed") {
    const t = await db.supportTicket.findUnique({ where: { id: ticketId }, select: { userId: true, subject: true } });
    if (t) {
      await notify({
        userId: t.userId,
        type: "system",
        title: status === "resolved" ? "Support ticket resolved" : "Support ticket closed",
        body: `Re: ${t.subject.slice(0, 80)}. Reply to reopen it if you still need help.`,
        linkUrl: `/settings/support/${ticketId}`,
      }).catch(() => {});
    }
  }
  revalidatePath(`/admin/support/${ticketId}`);
  revalidatePath("/admin/support");
  return { ok: true };
}
