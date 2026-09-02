"use client";

import { Heart, MessageCircle, Repeat2, Send, Bookmark, ThumbsUp } from "lucide-react";
import { Avatar } from "@/components/ui/misc";
import { PlatformBadge } from "@/components/brand";
import { PLATFORMS, type PlatformKey } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function PostPreview({
  platform,
  body,
  handle,
  mediaUrls,
}: {
  platform: string;
  body: string;
  handle: string;
  mediaUrls: string[];
}) {
  const p = platform as PlatformKey;
  const meta = PLATFORMS[p];
  const over = body.length > (meta?.limit ?? 99999);

  const media = mediaUrls[0] && (
    <div className="mt-2 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mediaUrls[0]} alt="" className="aspect-[4/3] w-full object-cover" />
    </div>
  );

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
      <div className="mb-2 flex items-center gap-2">
        <Avatar name={handle} size={30} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-[var(--text)]">{handle}</p>
          <p className="text-[12px] text-[var(--text-subtle)]">Just now</p>
        </div>
        <PlatformBadge platform={platform} size={18} />
      </div>

      {body ? (
        <p className={cn("whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--text)]", over && "line-clamp-[12]")}>
          {body}
        </p>
      ) : (
        <p className="text-[14px] italic text-[var(--text-subtle)]">Your caption preview appears here…</p>
      )}
      {media}

      <div className="mt-2.5 flex items-center gap-4 text-[var(--text-subtle)]">
        {p === "linkedin" || p === "facebook" ? <ThumbsUp size={14} /> : <Heart size={14} />}
        <MessageCircle size={14} />
        {p === "x" || p === "threads" || p === "bluesky" ? <Repeat2 size={14} /> : <Send size={14} />}
        {(p === "instagram" || p === "pinterest") && <Bookmark size={14} />}
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[12px]">
        <span className={cn(over ? "font-medium text-[var(--danger)]" : "text-[var(--text-subtle)]")}>
          {body.length.toLocaleString()} / {(meta?.limit ?? 0).toLocaleString()}
        </span>
        {over && <span className="text-[var(--danger)]">Over the limit</span>}
      </div>
    </div>
  );
}
