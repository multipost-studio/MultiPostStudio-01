"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  replyToTicketAction,
  assignTicketAction,
  setTicketPriorityAction,
  setTicketStatusAction,
} from "@/app/actions/support";
import { TICKET_STATUSES, TICKET_PRIORITIES } from "@/lib/support";

/**
 * The staff controls under a support thread: reply (public or internal note),
 * assign, priority, status. Every control refreshes on success so the thread
 * above and the queue behind it stay current.
 */
export function AdminTicketPanel({
  ticketId,
  status,
  priority,
  assignedToId,
  admins,
}: {
  ticketId: string;
  status: string;
  priority: string;
  assignedToId: string | null;
  admins: { id: string; label: string }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [body, setBody] = React.useState("");
  const [internal, setInternal] = React.useState(false);
  const [sending, setSending] = React.useState(false);

  async function send() {
    if (!body.trim()) return;
    setSending(true);
    try {
      const res = await replyToTicketAction(ticketId, body, { internal });
      if (res.ok) {
        setBody("");
        setInternal(false);
        toast({ title: internal ? "Note added" : "Reply sent", tone: "success" });
        router.refresh();
      } else {
        toast({ title: res.error ?? "Couldn't send", tone: "error" });
      }
    } catch {
      toast({ title: "Couldn't send", description: "Something went wrong — your text is still here.", tone: "error" });
    } finally {
      setSending(false);
    }
  }

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    const res = await fn();
    toast({ title: res.ok ? okMsg : res.error ?? "Failed", tone: res.ok ? "success" : "error" });
    if (res.ok) router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-[12px] text-[var(--text-subtle)]">
          Assignee
          <Select
            size="sm"
            value={assignedToId ?? ""}
            onChange={(e) => run(() => assignTicketAction(ticketId, e.target.value), "Assignee updated")}
          >
            <option value="">Unassigned</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-[var(--text-subtle)]">
          Priority
          <Select
            size="sm"
            value={priority}
            onChange={(e) => run(() => setTicketPriorityAction(ticketId, e.target.value as "normal"), "Priority updated")}
          >
            {TICKET_PRIORITIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-[var(--text-subtle)]">
          Status
          <Select
            size="sm"
            value={status}
            onChange={(e) => run(() => setTicketStatusAction(ticketId, e.target.value as "open"), "Status updated")}
          >
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </label>
      </div>

      <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder={internal ? "Internal note — the customer never sees this" : "Reply to the customer…"}
          className={`w-full resize-y rounded-[var(--radius)] border px-3 py-2 text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)] ${
            internal
              ? "border-[var(--warning)] bg-[var(--warning-soft)]/40 focus:border-[var(--warning)]"
              : "border-[var(--border)] bg-[var(--bg)] focus:border-[var(--primary)]"
          }`}
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={internal}
              onChange={(e) => setInternal(e.target.checked)}
            />
            Internal note (staff only)
          </label>
          <Button size="sm" onClick={send} loading={sending} disabled={!body.trim()}>
            {internal ? "Add note" : "Send reply"}
          </Button>
        </div>
      </div>
    </div>
  );
}
