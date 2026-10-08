import * as React from "react";
import { initialsOf, type PublicReview } from "@/lib/reviews/model";
import { cn } from "@/lib/utils";
import { Stars } from "./stars";

const TINTS = ["#f0762e", "#e0528a", "#4f7cf0", "#2fa57a", "#9b6bf0", "#d99a14"];

function tintOf(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

export function ReviewAvatar({ name, src, size = 44 }: { name: string; src?: string | null; size?: number }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} loading="lazy" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span aria-hidden className="flex shrink-0 items-center justify-center rounded-full font-bold text-white" style={{ width: size, height: size, background: tintOf(name), fontSize: size * 0.36 }}>
      {initialsOf(name)}
    </span>
  );
}

const DATE = new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" });

/** One review. Used in the landing marquee, the /reviews page and the admin preview. */
export function ReviewCard({ review, className, clamp = false }: { review: PublicReview; className?: string; clamp?: boolean }) {
  return (
    <figure className={cn("mps-rv-card flex h-full flex-col rounded-[20px] border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-card)]", className)}>
      <div className="flex items-center justify-between gap-3">
        <Stars rating={review.rating} size={16} />
        {review.featured && <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-[var(--primary-hover)]">Featured</span>}
      </div>
      {review.title && <p className="mt-3 text-[15.5px] font-bold leading-snug text-[var(--text)]">{review.title}</p>}
      {review.body && (
        <blockquote className={cn("mt-2 text-[14.5px] leading-relaxed text-[var(--text-muted)]", clamp && "line-clamp-5")}>
          <p>{review.body}</p>
        </blockquote>
      )}
      {review.adminReply && (
        <div className="mt-3 rounded-[12px] bg-[var(--surface)] px-3 py-2 text-[13px] leading-relaxed text-[var(--text-muted)]">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-[var(--text-subtle)]">Reply from the MultiPost Studio team</span>
          {review.adminReply}
        </div>
      )}
      <figcaption className="mt-auto flex items-center gap-3 pt-4">
        <ReviewAvatar name={review.authorName} src={review.avatarUrl} size={40} />
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-semibold text-[var(--text)]">{review.authorName}</span>
          <span className="block truncate text-[12.5px] text-[var(--text-subtle)]">
            {[review.authorRole, DATE.format(new Date(review.createdAt))].filter(Boolean).join(" · ")}
          </span>
        </span>
      </figcaption>
    </figure>
  );
}
