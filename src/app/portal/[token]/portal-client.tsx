"use client";

import * as React from "react";
import { Check, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PlatformBadge } from "@/components/brand";
import { useToast } from "@/components/ui/toast";
import { portalDecideApprovalAction } from "@/app/actions/portal";

import { REVISION_REASONS, type RevisionReasonKey } from "@/lib/approval-workflows";
import { cn } from "@/lib/utils";

export function PortalRequestCard({
  token,
  requestId,
  title,
  status,
  bodies,
}: {
  token: string;
  requestId: string;
  title: string;
  status: string;
  bodies: { platform: string; body: string; mediaUrls?: string[] }[];
}) {
  const { toast } = useToast();
  const [comment, setComment] = React.useState("");
  const [reasonCategory, setReasonCategory] = React.useState<RevisionReasonKey>("copy_edit");
  const [busy, setBusy] = React.useState<"approve" | "request_changes" | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  async function decide(decision: "approve" | "request_changes") {
    setBusy(decision);
    const reason = decision === "request_changes" ? reasonCategory : undefined;
    const res = await portalDecideApprovalAction(token, requestId, decision, comment, reason);
    setBusy(null);
    if (res.ok) {
      setDone(res.message ?? "Done");
      toast({ title: res.message ?? "Done", tone: "success" });
    } else {
      toast({ title: "Couldn't submit", description: res.error, tone: "error" });
    }
  }

  if (done) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 text-[14px] text-[var(--text-muted)]">
        <span className="font-medium text-[var(--text)]">{title}</span> — {done.toLowerCase()}
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[15px] font-semibold text-[var(--text)]">{title}</p>
        {status === "changes_requested" && <Badge tone="warning">Previously sent back</Badge>}
      </div>

      <div className="space-y-3">
        {bodies.map((b, i) => (
          <div key={i} className="rounded-[var(--radius-md)] border border-[var(--border)] p-3">
            <PlatformBadge platform={b.platform} className="mb-1.5" />
            <p className="whitespace-pre-wrap text-[13.5px] text-[var(--text)]">{b.body}</p>
            {b.mediaUrls && b.mediaUrls.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {b.mediaUrls.map((url, idx) => (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    key={idx}
                    src={url}
                    alt="Post media asset"
                    className="h-20 w-20 rounded-[var(--radius-sm)] object-cover border border-[var(--border)]"
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[11px] font-medium text-[var(--text-subtle)] mr-1">Feedback type:</span>
          {REVISION_REASONS.map((reason) => {
            const selected = reasonCategory === reason.key;
            return (
              <button
                key={reason.key}
                type="button"
                onClick={() => setReasonCategory(reason.key)}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer",
                  selected
                    ? "bg-[var(--primary)] text-white shadow-xs"
                    : "bg-[var(--surface-hover)] text-[var(--text-muted)] hover:text-[var(--text)]",
                )}
                title={reason.description}
              >
                {reason.label}
              </button>
            );
          })}
        </div>

        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Notes or requested changes (optional for approval, helpful for changes)"
          className="min-h-[60px]"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" loading={busy === "approve"} disabled={busy !== null} onClick={() => decide("approve")}>
          <Check size={14} /> Approve
        </Button>
        <Button
          size="sm"
          variant="secondary"
          loading={busy === "request_changes"}
          disabled={busy !== null}
          onClick={() => decide("request_changes")}
        >
          <MessageSquare size={14} /> Request changes
        </Button>
      </div>
    </div>
  );
}
