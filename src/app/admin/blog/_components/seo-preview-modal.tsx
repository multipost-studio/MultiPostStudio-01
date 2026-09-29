"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { appUrl } from "@/lib/env";
import { Globe, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function SeoPreviewModal({
  open,
  onOpenChange,
  title,
  slug,
  metaDescription,
  featuredImage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  slug: string;
  metaDescription: string;
  featuredImage?: string | null;
}) {
  const [tab, setTab] = React.useState<"google" | "social">("google");
  const url = `${appUrl().replace(/\/$/, "")}/blog/${slug || "your-slug"}`;

  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      title="Search & Social Previews"
      description="Inspect how your article appears when indexed by search engines or shared on social feeds."
      size="lg"
      footer={
        <div className="flex w-full justify-end">
          <Button size="sm" variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Segmented Tab Switcher */}
        <div className="flex items-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-sunken)] p-1 text-[13px]">
          <button
            type="button"
            onClick={() => setTab("google")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] py-1.5 font-medium transition-all",
              tab === "google"
                ? "bg-[var(--surface)] text-[var(--text)] shadow-xs"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            )}
          >
            <Globe size={14} />
            <span>Google Search (SERP)</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("social")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] py-1.5 font-medium transition-all",
              tab === "social"
                ? "bg-[var(--surface)] text-[var(--text)] shadow-xs"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            )}
          >
            <Share2 size={14} />
            <span>Social Card (OG / Twitter)</span>
          </button>
        </div>

        {tab === "google" ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Google Search Snippet
            </p>
            <div className="mt-3 font-sans">
              <div className="flex items-center gap-1.5 text-[12px] text-[#4d5156] dark:text-[#bdc1c6]">
                <span className="truncate">{url}</span>
              </div>
              <h3 className="mt-1 line-clamp-1 text-[18px] font-medium text-[#1a0dab] hover:underline dark:text-[#8ab4f8]">
                {title || "Untitled Blog Post"}
              </h3>
              <p className="mt-1 line-clamp-2 text-[13px] text-[#4d5156] dark:text-[#bdc1c6]">
                {metaDescription || "Add a meta description to see how your snippet will appear in search results."}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Social Sharing Card (1200x630)
            </p>
            <div className="mt-3 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-sm">
              {featuredImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={featuredImage} alt="" className="aspect-[1.91/1] w-full object-cover" />
              ) : (
                <div className="flex aspect-[1.91/1] w-full items-center justify-center bg-[var(--surface-hover)] text-[13px] text-[var(--text-subtle)]">
                  No Featured Image Attached
                </div>
              )}
              <div className="p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  multipost.studio
                </p>
                <h4 className="mt-1 line-clamp-1 text-[15px] font-semibold text-[var(--text)]">
                  {title || "Untitled Blog Post"}
                </h4>
                <p className="mt-1 line-clamp-2 text-[13px] text-[var(--text-muted)]">
                  {metaDescription || "Preview text will display here."}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
