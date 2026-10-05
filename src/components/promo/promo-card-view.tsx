"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import type { PromoCardData, PromoTone } from "@/lib/promo-cards";

const TONE: Record<PromoTone, { card: string; tile: string; cta: string }> = {
  brand: {
    card: "border-[var(--primary)]/25 bg-gradient-to-br from-[var(--primary-soft)] via-[var(--surface)] to-[var(--surface)]",
    tile: "bg-[var(--primary)] text-[var(--primary-text)]",
    cta: "bg-[var(--primary)] text-[var(--primary-text)] hover:bg-[var(--primary-hover)]",
  },
  accent: {
    card: "border-[var(--accent)]/30 bg-gradient-to-br from-[var(--accent-soft)] via-[var(--surface)] to-[var(--surface)]",
    tile: "bg-[var(--accent)] text-[var(--primary-text)]",
    cta: "bg-[var(--accent)] text-[var(--primary-text)] hover:bg-[var(--accent-hover)]",
  },
  neutral: {
    card: "border-[var(--border)] bg-[var(--surface)]",
    tile: "bg-[var(--bg-sunken)] text-[var(--text)]",
    cta: "border border-[var(--border-strong)] bg-transparent text-[var(--text)] hover:bg-[var(--surface-hover)]",
  },
};

const ctaClass =
  "mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-[var(--radius-sm)] px-3 text-[13px] font-semibold transition-colors active:scale-[0.985]";

/** The visual card. Shared by the sidebar and the admin live preview so what an admin sees is what ships. */
export function PromoCardView({
  card,
  preview = false,
  onDismiss,
  onCtaClick,
  className,
}: {
  card: PromoCardData;
  /** Admin preview: nothing navigates, nothing is tracked. */
  preview?: boolean;
  onDismiss?: () => void;
  onCtaClick?: () => void;
  className?: string;
}) {
  const tone = TONE[card.tone] ?? TONE.brand;
  const external = !card.ctaUrl.startsWith("/");

  return (
    <div className={cn("relative rounded-[var(--radius-md)] border p-3", tone.card, className)}>
      {card.dismissible && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={`Dismiss "${card.title}"`}
          className="absolute right-1.5 top-1.5 rounded-[var(--radius-sm)] p-1 text-[var(--text-subtle)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          <X size={13} aria-hidden />
        </button>
      )}

      <div className="flex items-start gap-2.5">
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-sm)]", !card.imageUrl && tone.tile)}>
          {card.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded asset, arbitrary size
            <img src={card.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Icon name={card.icon ?? "Sparkles"} size={16} aria-hidden />
          )}
        </span>
        <div className="min-w-0 pr-4">
          <p className="text-[13.5px] font-semibold leading-snug text-[var(--text)]">{card.title}</p>
          <p className="mt-0.5 line-clamp-3 text-[12.5px] leading-snug text-[var(--text-muted)]">{card.description}</p>
        </div>
      </div>

      {preview ? (
        <button type="button" className={cn(ctaClass, tone.cta)}>
          {card.ctaText}
          <ArrowUpRight size={13} aria-hidden />
        </button>
      ) : external ? (
        <a href={card.ctaUrl} target="_blank" rel="noopener noreferrer" onClick={onCtaClick} className={cn(ctaClass, tone.cta)}>
          {card.ctaText}
          <ArrowUpRight size={13} aria-hidden />
        </a>
      ) : (
        <Link href={card.ctaUrl} onClick={onCtaClick} className={cn(ctaClass, tone.cta)}>
          {card.ctaText}
          <ArrowUpRight size={13} aria-hidden />
        </Link>
      )}
    </div>
  );
}
