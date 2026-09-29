"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { adminResolvePrivacyRequestAction } from "@/app/actions/privacy";

export function ResolveForm({ id, currentStatus }: { id: string; currentStatus: string }) {
  const [pending, start] = useTransition();
  const [status, setStatus] = React.useState(currentStatus === "submitted" ? "in_progress" : currentStatus);
  const [note, setNote] = React.useState("");
  const router = useRouter();
  const { toast } = useToast();

  if (currentStatus === "completed" || currentStatus === "rejected") {
    return <span className="text-[12px] text-[var(--text-subtle)]">Resolved</span>;
  }

  return (
    <div className="w-56 space-y-1.5">
      <Select value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="in_progress">In progress</option>
        <option value="completed">Completed</option>
        <option value="rejected">Rejected</option>
      </Select>
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Resolution note (required)"
        rows={2}
        className="text-[12px]"
      />
      <Button
        size="sm"
        loading={pending}
        disabled={!note.trim()}
        onClick={() =>
          start(async () => {
            const res = await adminResolvePrivacyRequestAction(id, status as "in_progress" | "completed" | "rejected", note);
            toast({ title: res.message ?? res.error ?? "", tone: res.ok ? "success" : "error" });
            if (res.ok) router.refresh();
          })
        }
      >
        Save
      </Button>
    </div>
  );
}
