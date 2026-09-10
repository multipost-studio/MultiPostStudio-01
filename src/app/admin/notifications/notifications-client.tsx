"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { dismissAdminItemAction, dismissAllAdminItemsAction } from "@/app/actions/admin-notifications";

export function MarkAllRead({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={busy}
      disabled={disabled || busy}
      onClick={async () => {
        setBusy(true);
        const res = await dismissAllAdminItemsAction();
        setBusy(false);
        toast({ title: res.message ?? "Done", tone: "success" });
        router.refresh();
      }}
    >
      Mark all read
    </Button>
  );
}

export function DismissItem({ itemKey, seen }: { itemKey: string; seen: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  if (seen) return null;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setBusy(true);
        await dismissAdminItemAction(itemKey);
        setBusy(false);
        router.refresh();
      }}
      title="Mark read"
      className="shrink-0 rounded px-1.5 py-0.5 text-[12px] text-[var(--text-subtle)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)] disabled:opacity-50"
    >
      &#10003;
    </button>
  );
}
