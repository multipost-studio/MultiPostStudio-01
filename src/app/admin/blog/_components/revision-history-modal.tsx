"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { History, RotateCcw, Clock, User, ChevronRight } from "lucide-react";
import { restoreBlogPostRevisionAction } from "@/app/actions/blog";
import { formatDate } from "@/lib/utils";

export type RevisionItem = {
  id: string;
  title: string;
  content: string;
  excerpt?: string | null;
  authorName?: string | null;
  summary?: string | null;
  createdAt: Date | string;
};

export function RevisionHistoryModal({
  open,
  onOpenChange,
  postId,
  revisions,
  onRestored,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId: string;
  revisions: RevisionItem[];
  onRestored: (revision: RevisionItem) => void;
}) {
  const [selected, setSelected] = React.useState<RevisionItem | null>(revisions[0] || null);
  const [restoring, setRestoring] = React.useState(false);

  React.useEffect(() => {
    if (revisions.length > 0 && !selected) {
      setSelected(revisions[0]);
    }
  }, [revisions, selected]);

  async function handleRestore(rev: RevisionItem) {
    if (!confirm(`Restore version from ${new Date(rev.createdAt).toLocaleString()}? This will replace current draft content.`)) {
      return;
    }

    setRestoring(true);
    try {
      const res = await restoreBlogPostRevisionAction(postId, rev.id);
      if (res.ok) {
        onRestored(rev);
        onOpenChange(false);
      } else {
        alert(res.error || "Failed to restore revision");
      }
    } catch {
      alert("Failed to restore revision");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl p-0">
        <DialogHeader className="border-b border-[var(--border)] px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <History size={18} className="text-[var(--primary)]" />
            <span>Revision History</span>
          </DialogTitle>
        </DialogHeader>

        <div className="grid h-[600px] grid-cols-1 md:grid-cols-3">
          {/* Revisions list */}
          <div className="overflow-y-auto border-r border-[var(--border)] p-3">
            {revisions.length === 0 ? (
              <p className="p-4 text-center text-[13px] text-[var(--text-muted)]">No previous revisions recorded yet.</p>
            ) : (
              <div className="space-y-1.5">
                {revisions.map((rev) => {
                  const active = selected?.id === rev.id;
                  return (
                    <button
                      key={rev.id}
                      type="button"
                      onClick={() => setSelected(rev)}
                      className={`w-full rounded-[var(--radius-md)] p-2.5 text-left transition-colors ${
                        active
                          ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                          : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] font-medium">
                        <span className="flex items-center gap-1 text-[var(--text-subtle)]">
                          <Clock size={12} />
                          {new Date(rev.createdAt).toLocaleDateString()} {new Date(rev.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {rev.authorName && (
                          <span className="flex items-center gap-0.5 truncate text-[10px] text-[var(--text-subtle)]">
                            <User size={10} />
                            {rev.authorName}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-1 text-[13px] font-medium text-[var(--text)]">
                        {rev.summary || rev.title}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Revision preview panel */}
          <div className="col-span-2 flex flex-col justify-between overflow-y-auto bg-[var(--surface)] p-6">
            {selected ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--text)]">{selected.title}</h3>
                    <p className="text-[12px] text-[var(--text-subtle)]">
                      Saved on {new Date(selected.createdAt).toLocaleString()} {selected.authorName ? `by ${selected.authorName}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={restoring}
                    onClick={() => handleRestore(selected)}
                    className="gap-1.5"
                  >
                    <RotateCcw size={14} />
                    <span>Restore Version</span>
                  </Button>
                </div>

                {selected.excerpt && (
                  <div className="rounded-[var(--radius-md)] bg-[var(--bg-elevated)] p-3 text-[13px] italic text-[var(--text-muted)]">
                    {selected.excerpt}
                  </div>
                )}

                <div className="prose prose-sm dark:prose-invert max-w-none text-[13.5px] leading-relaxed whitespace-pre-wrap text-[var(--text)]">
                  {selected.content}
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-[13px] text-[var(--text-muted)]">
                Select a revision to preview and compare
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
