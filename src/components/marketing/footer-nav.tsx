"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import type { RenderLink } from "@/lib/footer/resolve";
import { cn } from "@/lib/utils";
import { FooterAnchor } from "./footer-anchor";

type Column = { id: string; title: string; links: RenderLink[] };

/** Static class names so Tailwind sees them: more columns fit fewer per row so labels never get cramped. */
function gridClass(count: number): string {
  return count <= 5 ? "lg:grid-cols-5" : "lg:grid-cols-4";
}

/**
 * The footer's link columns. From tablet up every column is open and laid out in a
 * grid. On a phone, ten-link columns would make the footer endless, so each column
 * becomes an accordion (collapsed, one tap to open). The server renders everything
 * open, so crawlers and no-JS visitors still get every link.
 */
export function FooterNav({ columns }: { columns: Column[] }) {
  const [wide, setWide] = React.useState(true);
  const [openId, setOpenId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return (
    <nav aria-label="Footer" className={cn("grid grid-cols-1 gap-x-8 sm:grid-cols-3 sm:gap-y-10", gridClass(columns.length))}>
      {columns.map((col) => {
        const open = wide || openId === col.id;
        const panelId = `footer-col-${col.id}`;
        return (
          <div key={col.id} className={cn("min-w-0", !wide && "border-b border-white/10")}>
            {wide ? (
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/40">{col.title}</p>
            ) : (
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenId(open ? null : col.id)}
                className="mps-footer__colbtn py-4 text-[13px] font-semibold uppercase tracking-[0.12em] text-white/70"
              >
                <span>{col.title}</span>
                <ChevronDown size={16} aria-hidden className={cn("shrink-0 text-white/40 transition-transform duration-300", open && "rotate-180")} />
              </button>
            )}
            <div id={panelId} inert={!open} className={cn("grid transition-[grid-template-rows] duration-300 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
              {/* The padding lives on the list, inside the clipped wrapper, so a closed column collapses to nothing. */}
              <div className="min-h-0 overflow-hidden">
                <ul className={wide ? "mt-4 space-y-2.5" : "space-y-3 pb-4"}>
                  {col.links.map((l) => (
                    <li key={l.href + l.label}>
                      <FooterAnchor link={l} className="mps-footer__link text-[15px] leading-snug text-white/80" />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}
