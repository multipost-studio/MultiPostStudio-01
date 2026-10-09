"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { promptReason } from "@/components/ui/confirm";
import { restoreConfigRevisionAction } from "@/app/actions/admin-config";

export function RestoreButton({ revisionId, label }: { revisionId: string; label: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);

  async function restore() {
    const reason = await promptReason({
      title: `Restore ${label}`,
      body: `Put ${label.toLowerCase()} back to this version? It takes effect immediately. The current version stays in the history, so you can undo this.`,
      confirmLabel: "Restore",
    });
    if (!reason) return;
    setBusy(true);
    try {
      const res = await restoreConfigRevisionAction(revisionId, reason);
      toast({ title: res.ok ? res.message : res.error, tone: res.ok ? "success" : "error" });
      if (res.ok) router.refresh();
    } catch {
      toast({ title: "Couldn't restore that version. Try again.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="secondary" loading={busy} onClick={restore}>
      Restore this version
    </Button>
  );
}
