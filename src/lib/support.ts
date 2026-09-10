/**
 * Support-ticket helpers shared by the customer side (/settings/support) and
 * the admin side (/admin/support).
 *
 * The one rule that matters: an `internal` message is visible to platform
 * staff only. `visibleMessages` is what the customer is ever allowed to see,
 * and every customer-facing query goes through it.
 */

export type TicketStatus = "open" | "pending" | "resolved" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "urgent";

export const TICKET_STATUSES: TicketStatus[] = ["open", "pending", "resolved", "closed"];
export const TICKET_PRIORITIES: TicketPriority[] = ["low", "normal", "high", "urgent"];

/** Statuses that count as "the customer is waiting on us". */
const OPEN_STATES: TicketStatus[] = ["open", "pending"];

export type ThreadMessage = {
  id: string;
  authorRole: "user" | "staff";
  internal: boolean;
  body: string;
  attachmentUrl?: string | null;
  createdAt: Date;
  authorName?: string | null;
};

/** Drop internal notes. Use for anything the ticket opener can see. */
export function visibleMessages<T extends { internal: boolean }>(messages: T[]): T[] {
  return messages.filter((m) => !m.internal);
}

/**
 * Where a ticket sits in the queue.
 *  - "you"   : the customer replied last, or it's brand new — staff action needed
 *  - "them"  : staff replied last — waiting on the customer
 *  - "done"  : resolved or closed
 */
export function queueSide(t: {
  status: string;
  lastReplyRole: string | null;
}): "you" | "them" | "done" {
  if (t.status === "resolved" || t.status === "closed") return "done";
  if (t.lastReplyRole === "staff") return "them";
  return "you";
}

export function isOpenState(status: string): boolean {
  return (OPEN_STATES as string[]).includes(status);
}

/** First line of a body, trimmed, for list previews. */
export function preview(body: string, max = 140): string {
  const line = body.trim().replace(/\s+/g, " ");
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}
