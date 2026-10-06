"use client";

import * as React from "react";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PlatformBadge } from "@/components/brand";
import type { AdaptProposal } from "@/lib/platform-rules";

export type ChannelAdaptProposal = AdaptProposal & { channelId: string; name: string };

/**
 * "Adapt to all channels" never edits silently. This lists, per channel, what
 * the adaptation will do — including any hashtags dropped to fit a hard limit —
 * and applies only the channels the user leaves ticked.
 */
export function AdaptReviewDialog({
  proposals,
  onApply,
  onClose,
}: {
  proposals: ChannelAdaptProposal[] | null;
  onApply: (chosen: ChannelAdaptProposal[]) => void;
  onClose: () => void;
}) {
  const [off, setOff] = React.useState<Set<string>>(new Set());
  React.useEffect(() => setOff(new Set()), [proposals]);
  const chosen = (proposals ?? []).filter((p) => !off.has(p.channelId));

  return (
    <Modal
      open={proposals != null}
      onClose={onClose}
      title="Review adapted text"
      description="Nothing is applied until you confirm. Untick a channel to keep its current text."
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={chosen.length === 0} onClick={() => onApply(chosen)}>
            Apply to {chosen.length} channel{chosen.length === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      <ul className="space-y-3">
        {(proposals ?? []).map((p) => {
          const id = `adapt-${p.channelId}`;
          return (
            <li key={p.channelId} className="rounded-[var(--radius-md)] border border-[var(--border)] p-3">
              <div className="flex items-center gap-2">
                <input
                  id={id}
                  type="checkbox"
                  checked={!off.has(p.channelId)}
                  onChange={(e) =>
                    setOff((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.delete(p.channelId);
                      else next.add(p.channelId);
                      return next;
                    })
                  }
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                <label htmlFor={id} className="flex items-center gap-1.5 text-[14px] font-semibold text-[var(--text)]">
                  <PlatformBadge platform={p.platform} size={16} /> Adapted for {p.name}
                </label>
              </div>
              {p.changes.length > 0 ? (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[13px] text-[var(--text-muted)]">
                  {p.changes.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[13px] text-[var(--text-muted)]">No changes beyond the adapted text.</p>
              )}
              {p.remainingErrors.map((e) => (
                <p key={e} className="mt-1.5 flex items-start gap-1.5 text-[13px] text-[var(--danger)]">
                  <CircleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
                  <span>Still needs a fix: {e}</span>
                </p>
              ))}
              <details className="mt-2">
                <summary className="cursor-pointer text-[12.5px] font-medium text-[var(--primary)]">Compare text</summary>
                <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">Current</p>
                    <p className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-[var(--bg-sunken)] p-2 text-[12.5px] text-[var(--text-muted)]">{p.before || "—"}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">Adapted</p>
                    <p className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-[var(--bg-sunken)] p-2 text-[12.5px] text-[var(--text)]">{p.after}</p>
                  </div>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
