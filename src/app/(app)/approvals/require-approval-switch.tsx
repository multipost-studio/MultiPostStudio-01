"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { setRequireApprovalAction } from "@/app/actions/approvals";

/** Optional (default) or mandatory approval for this workspace. */
export function RequireApprovalSwitch({ required, canConfigure }: { required: boolean; canConfigure: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);

  async function toggle() {
    setBusy(true);
    const res = await setRequireApprovalAction(!required);
    setBusy(false);
    toast({ title: res.ok ? res.message ?? "Updated" : "Couldn't change the setting", description: res.error, tone: res.ok ? "success" : "error" });
    router.refresh();
  }

  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="max-w-2xl">
        <p className="flex items-center gap-2 text-[14px] font-semibold text-[var(--text)]">
          <ShieldCheck size={15} />
          {required ? "Approval is required before publishing" : "Approval is optional"}
        </p>
        <p className="mt-1 text-[13px] text-[var(--text-muted)]">
          {required
            ? "Nothing in this workspace can be scheduled, queued or published until its current content has been approved, including posts created through the API. Editing a post after approval sends it back for approval. A scheduled post that is not approved is moved back to draft instead of going out."
            : "Anyone who can publish may schedule a post whether or not it went through approval. Turn this on to make sign-off mandatory for every post in this workspace."}
        </p>
      </div>
      {canConfigure && (
        <Button size="sm" variant={required ? "secondary" : "primary"} loading={busy} onClick={toggle}>
          {required ? "Make approval optional" : "Require approval"}
        </Button>
      )}
    </div>
  );
}
