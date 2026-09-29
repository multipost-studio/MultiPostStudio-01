"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Monitor, Tablet, Smartphone, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export function BlogPreviewModal({
  open,
  onOpenChange,
  post,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: {
    title: string;
    subtitle?: string | null;
    content: string;
    excerpt?: string | null;
    authorName?: string;
    categoryName?: string;
    publishedAt?: Date | string | null;
    readMins?: number;
    featuredImage?: string | null;
    featuredImageCaption?: string | null;
  };
}) {
  const [viewport, setViewport] = React.useState<"desktop" | "tablet" | "mobile">("desktop");

  const widthClass =
    viewport === "desktop" ? "w-full max-w-4xl" : viewport === "tablet" ? "w-full max-w-[768px]" : "w-full max-w-[375px]";

  // Convert content lines into paragraphs or headings for realistic preview
  const paragraphs = (post.content || "").split("\n\n").filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-hidden p-0">
        <DialogHeader className="border-b border-[var(--border)] px-6 py-3">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[15px]">Live Blog Layout Preview</DialogTitle>
            <div className="flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-0.5 text-[12px]">
              <button
                type="button"
                onClick={() => setViewport("desktop")}
                className={`flex items-center gap-1 rounded-[var(--radius-sm)] px-2.5 py-1 ${
                  viewport === "desktop" ? "bg-[var(--primary-soft)] text-[var(--primary)] font-medium" : "text-[var(--text-muted)]"
                }`}
              >
                <Monitor size={14} />
                <span>Desktop</span>
              </button>
              <button
                type="button"
                onClick={() => setViewport("tablet")}
                className={`flex items-center gap-1 rounded-[var(--radius-sm)] px-2.5 py-1 ${
                  viewport === "tablet" ? "bg-[var(--primary-soft)] text-[var(--primary)] font-medium" : "text-[var(--text-muted)]"
                }`}
              >
                <Tablet size={14} />
                <span>Tablet</span>
              </button>
              <button
                type="button"
                onClick={() => setViewport("mobile")}
                className={`flex items-center gap-1 rounded-[var(--radius-sm)] px-2.5 py-1 ${
                  viewport === "mobile" ? "bg-[var(--primary-soft)] text-[var(--primary)] font-medium" : "text-[var(--text-muted)]"
                }`}
              >
                <Smartphone size={14} />
                <span>Mobile</span>
              </button>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable preview body */}
        <div className="flex justify-center overflow-y-auto bg-[var(--bg)] p-6" style={{ maxHeight: "calc(92vh - 65px)" }}>
          <div className={`${widthClass} transition-all duration-300 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] p-8 shadow-sm`}>
            {post.categoryName && (
              <div className="mb-3">
                <Badge tone="primary">{post.categoryName}</Badge>
              </div>
            )}

            <h1 className="text-3xl font-bold tracking-tight text-[var(--text)] sm:text-4xl">
              {post.title || "Untitled Blog Post"}
            </h1>

            {post.subtitle && (
              <p className="mt-2 text-lg text-[var(--text-muted)]">{post.subtitle}</p>
            )}

            <div className="mt-4 flex items-center gap-2 border-b border-[var(--border)] pb-6 text-[13px] text-[var(--text-subtle)]">
              <span>{post.authorName || "MultiPost Studio Team"}</span>
              <span>·</span>
              <span>{formatDate(post.publishedAt || new Date())}</span>
              <span>·</span>
              <span>{post.readMins || 5} min read</span>
            </div>

            {post.featuredImage && (
              <div className="my-6 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)]">
                <img src={post.featuredImage} alt="" className="w-full object-cover" />
                {post.featuredImageCaption && (
                  <p className="p-2 text-center text-[12px] text-[var(--text-subtle)]">{post.featuredImageCaption}</p>
                )}
              </div>
            )}

            <div className="prose prose-neutral dark:prose-invert mt-6 max-w-none space-y-4 text-[15px] leading-relaxed text-[var(--text)]">
              {paragraphs.map((p, i) => {
                if (p.startsWith("### ")) {
                  return <h3 key={i} className="text-xl font-semibold text-[var(--text)]">{p.replace("### ", "")}</h3>;
                }
                if (p.startsWith("## ")) {
                  return <h2 key={i} className="text-2xl font-semibold text-[var(--text)]">{p.replace("## ", "")}</h2>;
                }
                if (p.startsWith("> ")) {
                  return (
                    <blockquote key={i} className="border-l-4 border-[var(--primary)] pl-4 italic text-[var(--text-muted)]">
                      {p.replace(/^>\s*/, "")}
                    </blockquote>
                  );
                }
                return <p key={i}>{p}</p>;
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
