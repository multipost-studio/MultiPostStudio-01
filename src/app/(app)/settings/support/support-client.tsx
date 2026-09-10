"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { openSupportTicketAction, replyToTicketAction } from "@/app/actions/support";

/** "Open a request" form on the support list page. */
export function NewTicketForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        Open a request
      </Button>
    );
  }

  return (
    <form
      className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4"
      action={async (fd) => {
        setPending(true);
        try {
          const res = await openSupportTicketAction(null, fd);
          toast({
            title: res.ok ? res.message ?? "Sent" : "Couldn't send",
            description: res.error,
            tone: res.ok ? "success" : "error",
          });
          if (res.ok) {
            setOpen(false);
            router.refresh();
          }
        } catch {
          toast({ title: "Couldn't send", description: "Something went wrong — your text is still here.", tone: "error" });
        } finally {
          setPending(false);
        }
      }}
    >
      <Field label="Subject">
        <Input name="subject" required placeholder="Can't connect my Instagram account" />
      </Field>
      <Field label="What's going on?">
        <textarea
          name="body"
          required
          rows={5}
          placeholder="Tell us what you were doing, what you expected, and what happened instead."
          className="w-full resize-y rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--primary)]"
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button>
        <Button size="sm" type="submit" loading={pending}>Send request</Button>
      </div>
    </form>
  );
}

/** Reply box on a customer's ticket thread. */
export function CustomerReplyBox({ ticketId, closed }: { ticketId: string; closed: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [body, setBody] = React.useState("");
  const [sending, setSending] = React.useState(false);

  async function send() {
    if (!body.trim()) return;
    setSending(true);
    try {
      const res = await replyToTicketAction(ticketId, body);
      if (res.ok) {
        setBody("");
        toast({ title: closed ? "Reply sent — ticket reopened" : "Reply sent", tone: "success" });
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

  return (
    <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder={closed ? "Reply to reopen this ticket…" : "Reply…"}
        className="w-full resize-y rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--primary)]"
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={send} loading={sending} disabled={!body.trim()}>Send</Button>
      </div>
    </div>
  );
}
