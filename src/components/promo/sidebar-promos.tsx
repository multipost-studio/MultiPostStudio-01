"use client";

import * as React from "react";
import Link from "next/link";
import { useReducedMotion } from "motion/react";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { useSidebar } from "@/components/ui/sidebar";
import { dismissPromoCardAction } from "@/app/actions/promo-cards";
import type { PromoCardData } from "@/lib/promo-cards";
import { cn } from "@/lib/utils";
import { PromoCardView } from "./promo-card-view";
import { trackClick, useImpression } from "./promo-tracking";

const ROTATE_MS = 7000;

/**
 * Admin-managed cards in the app sidebar. One card at a time, rotating on a
 * loop (paused on hover/focus, in a background tab, and entirely under
 * prefers-reduced-motion — dots still navigate). All slides share one grid
 * cell so the sidebar never jumps height as cards change.
 */
export function SidebarPromos({ cards }: { cards: PromoCardData[] }) {
  const reduce = useReducedMotion();
  const sidebar = useSidebar();
  const { toast } = useToast();
  const [dismissed, setDismissed] = React.useState<ReadonlySet<string>>(new Set());
  const [index, setIndex] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  const visible = React.useMemo(() => cards.filter((c) => !dismissed.has(c.id)), [cards, dismissed]);
  const safeIndex = visible.length ? index % visible.length : 0;
  const current = visible[safeIndex];
  const collapsed = sidebar?.state === "collapsed" && !sidebar.isMobile;

  // Autoplay.
  React.useEffect(() => {
    if (visible.length < 2 || paused || reduce || collapsed) return;
    const id = window.setInterval(() => {
      if (!document.hidden) setIndex((i) => i + 1);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [visible.length, paused, reduce, collapsed]);

  useImpression(current?.id);

  if (!current) return null;

  const onClick = trackClick;

  async function dismiss(id: string) {
    setDismissed((s) => new Set(s).add(id));
    const res = await dismissPromoCardAction(id);
    if (!res.ok) {
      setDismissed((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
      toast({ title: res.error, tone: "error" });
    }
  }

  if (collapsed) {
    const external = !current.ctaUrl.startsWith("/");
    const tile = (
      <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--primary)]/30 bg-[var(--primary-soft)] text-[var(--primary)] transition-colors hover:bg-[var(--primary)] hover:text-[var(--primary-text)]">
        <Icon name={current.icon ?? "Sparkles"} size={16} aria-hidden />
      </span>
    );
    return (
      <div className="flex w-full justify-center">
        <Tooltip content={`${current.title} — ${current.ctaText}`}>
          {external ? (
            <a href={current.ctaUrl} target="_blank" rel="noopener noreferrer" aria-label={current.title} onClick={() => onClick(current.id)}>
              {tile}
            </a>
          ) : (
            <Link href={current.ctaUrl} aria-label={current.title} onClick={() => onClick(current.id)}>
              {tile}
            </Link>
          )}
        </Tooltip>
      </div>
    );
  }

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Promotions"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      // Short viewports: the nav matters more than a promo.
      className="[@media(max-height:680px)]:hidden"
    >
      <div className="grid" aria-live={paused ? "polite" : "off"}>
        {visible.map((card, i) => {
          const active = i === safeIndex;
          return (
            <div
              key={card.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${visible.length}`}
              aria-hidden={!active}
              inert={!active}
              className={cn(
                "col-start-1 row-start-1 transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none",
                active ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0",
              )}
            >
              <PromoCardView card={card} onDismiss={() => void dismiss(card.id)} onCtaClick={() => onClick(card.id)} className="h-full" />
            </div>
          );
        })}
      </div>

      {visible.length > 1 && (
        <div className="mt-2 flex items-center justify-center" role="tablist" aria-label="Choose promotion">
          {visible.map((card, i) => (
            <button
              key={card.id}
              type="button"
              role="tab"
              aria-selected={i === safeIndex}
              aria-label={`Show promotion ${i + 1} of ${visible.length}`}
              onClick={() => setIndex(i)}
              className="group flex h-5 items-center px-1"
            >
              <span
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === safeIndex ? "w-4 bg-[var(--primary)]" : "w-1.5 bg-[var(--border-strong)] group-hover:bg-[var(--text-subtle)]",
                )}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
