"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, X, ShieldAlert, Trash2, MessageSquare, ExternalLink, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { moderateBlogCommentAction, bulkModerateCommentsAction } from "@/app/actions/blog";
import { formatDate } from "@/lib/utils";

type CommentItem = {
  id: string;
  postId: string;
  authorName: string;
  authorEmail: string;
  content: string;
  status: string;
  createdAt: Date;
  post: { id: string; title: string; slug: string };
};

export function CommentsClient({
  initialComments,
  counts,
  currentStatus,
}: {
  initialComments: CommentItem[];
  counts: { pending: number; approved: number; spam: number; rejected: number };
  currentStatus: string;
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);

  function setFilter(status: string) {
    router.push(`/admin/blog/comments?status=${status}`);
  }

  async function handleModerate(id: string, status: "approved" | "pending" | "spam" | "rejected" | "deleted") {
    setLoading(true);
    try {
      const res = await moderateBlogCommentAction(id, status);
      if (res.ok) {
        router.refresh();
      } else {
        alert("Failed to update comment");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleBulk(status: "approved" | "spam" | "rejected" | "deleted") {
    if (!selectedIds.length) return;
    setLoading(true);
    try {
      const res = await bulkModerateCommentsAction(selectedIds, status);
      if (res.ok) {
        setSelectedIds([]);
        router.refresh();
      } else {
        alert("Failed to moderate comments");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-2">
        <div className="flex items-center gap-1">
          {[
            { id: "pending", label: "Pending", count: counts.pending },
            { id: "approved", label: "Approved", count: counts.approved },
            { id: "spam", label: "Spam", count: counts.spam },
            { id: "rejected", label: "Rejected", count: counts.rejected },
            { id: "all", label: "All Comments", count: counts.pending + counts.approved + counts.spam + counts.rejected },
          ].map((t) => {
            const active = currentStatus === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setFilter(t.id)}
                className={`flex items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-[var(--primary)] text-[var(--primary-text)] shadow-xs"
                    : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                }`}
              >
                <span>{t.label}</span>
                <span className={`rounded-full px-1.5 py-0.2 text-[11px] tabular-nums ${active ? "bg-white/20 text-white" : "bg-[var(--surface-hover)] text-[var(--text-subtle)]"}`}>
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>

        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2 text-[13px]">
            <span className="font-semibold text-[var(--text)]">{selectedIds.length} selected</span>
            <Button size="sm" variant="outline" onClick={() => handleBulk("approved")} className="gap-1">
              <Check size={12} />
              <span>Approve</span>
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBulk("spam")} className="gap-1">
              <ShieldAlert size={12} />
              <span>Mark Spam</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => handleBulk("deleted")} className="text-[var(--danger)] gap-1">
              <Trash2 size={12} />
              <span>Delete</span>
            </Button>
          </div>
        )}
      </div>

      {/* Comment List */}
      {initialComments.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
          <MessageSquare size={36} className="text-[var(--text-subtle)]" />
          <p className="mt-3 font-medium text-[var(--text)]">No comments in this view</p>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">
            Reader comments will appear here for review and moderation.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {initialComments.map((comment) => {
            const isSelected = selectedIds.includes(comment.id);
            return (
              <div
                key={comment.id}
                className={`rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xs transition-colors ${
                  isSelected ? "border-[var(--primary)] bg-[var(--primary-soft)]/20" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds([...selectedIds, comment.id]);
                        else setSelectedIds(selectedIds.filter((id) => id !== comment.id));
                      }}
                      className="rounded border-[var(--border)]"
                    />
                    <div>
                      <span className="font-semibold text-[var(--text)]">{comment.authorName}</span>
                      <span className="text-[12px] text-[var(--text-subtle)]"> ({comment.authorEmail})</span>
                      <span className="text-[12px] text-[var(--text-subtle)]"> · {formatDate(comment.createdAt)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Badge tone={comment.status === "approved" ? "success" : comment.status === "spam" ? "danger" : "warning"}>
                      {comment.status.toUpperCase()}
                    </Badge>
                  </div>
                </div>

                <p className="mt-2 text-[14px] text-[var(--text)] whitespace-pre-wrap">{comment.content}</p>

                <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-2.5 text-[12px]">
                  <div className="flex items-center gap-1 text-[var(--text-muted)]">
                    <span>On:</span>
                    <Link
                      href={`/blog/${comment.post.slug}`}
                      target="_blank"
                      className="font-medium text-[var(--primary)] hover:underline inline-flex items-center gap-1"
                    >
                      <span>{comment.post.title}</span>
                      <ExternalLink size={11} />
                    </Link>
                  </div>

                  <div className="flex items-center gap-2">
                    {comment.status !== "approved" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleModerate(comment.id, "approved")}
                        className="h-7 text-[12px] text-[var(--success)]"
                      >
                        Approve
                      </Button>
                    )}
                    {comment.status !== "rejected" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleModerate(comment.id, "rejected")}
                        className="h-7 text-[12px]"
                      >
                        Reject
                      </Button>
                    )}
                    {comment.status !== "spam" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleModerate(comment.id, "spam")}
                        className="h-7 text-[12px] text-[var(--warning)]"
                      >
                        Spam
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleModerate(comment.id, "deleted")}
                      className="h-7 text-[12px] text-[var(--danger)]"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
