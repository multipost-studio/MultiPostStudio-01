"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { confirmDestructive } from "@/components/ui/confirm";
import { addAdminNoteAction, deleteAdminNoteAction, setAdminNotePinnedAction } from "@/app/actions/admin-notes";

const MAX = 2000;

export function NoteForm({ entityType, entityId }: { entityType: "user" | "organization"; entityId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [body, setBody] = React.useState("");
  const [pinned, setPinned] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      const res = await addAdminNoteAction({ entityType, entityId, body, pinned });
      toast({ title: res.ok ? res.message ?? "Note added" : res.error, tone: res.ok ? "success" : "error" });
      if (res.ok) {
        setBody("");
        setPinned(false);
        router.refresh();
      }
    } catch {
      toast({ title: "Couldn't save the note. Try again.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={MAX} placeholder="Add a note for your team…" aria-label="New internal note" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> Pin to the top
        </label>
        <div className="flex items-center gap-3">
          <span className="text-[12.5px] tabular-nums text-[var(--text-muted)]">{body.length}/{MAX}</span>
          <Button type="submit" size="sm" disabled={!body.trim() || busy}>Add note</Button>
        </div>
      </div>
    </form>
  );
}

export function NoteRowActions({ id, pinned, canDelete }: { id: string; pinned: boolean; canDelete: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);

  async function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) toast({ title: res.error ?? "Something went wrong", tone: "error" });
      else router.refresh();
    } catch {
      toast({ title: "Something went wrong. Try again.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-1.5">
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => setAdminNotePinnedAction(id, !pinned))}>
        {pinned ? "Unpin" : "Pin"}
      </Button>
      {canDelete && (
        <Button
          size="sm"
          variant="ghost"
          className="text-[var(--danger)]"
          disabled={busy}
          onClick={async () => {
            if (!(await confirmDestructive({ title: "Delete note", body: "Delete this note for everyone? This can't be undone.", confirmLabel: "Delete" }))) return;
            await run(() => deleteAdminNoteAction(id));
          }}
        >
          Delete
        </Button>
      )}
    </div>
  );
}
