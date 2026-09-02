"use client";

import { PlatformBadge } from "@/components/brand";
import { PLATFORM_KEYS, PLATFORMS } from "@/lib/constants";

export function PlatformMarquee() {
  const items = [...PLATFORM_KEYS, ...PLATFORM_KEYS];
  return (
    <div className="border-b border-[var(--border)] bg-[var(--bg-elevated)] py-8">
      <p className="mb-5 text-center text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--text-subtle)]">
        Publishes to every platform that matters
      </p>
      <div className="cad-marquee-mask overflow-hidden">
        <div className="cad-marquee-track gap-3">
          {items.map((p, i) => (
            <span
              key={i}
              className="flex shrink-0 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-[14px] font-semibold text-[var(--text)] shadow-sm"
            >
              <PlatformBadge platform={p} size={18} />
              {PLATFORMS[p].label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
