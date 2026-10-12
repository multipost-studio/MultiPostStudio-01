"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Segmented } from "@/components/ui/controls";
import { DateRangeFields } from "@/components/date-range-fields";

/** Period for the AI call activity section. Uses its own URL keys so it never fights the credentials list's filters. */
export function CallRange({ preset, custom, today, label = "Call activity period" }: { preset: string; custom: { from: string; to: string } | null; today: string; label?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [customOpen, setCustomOpen] = React.useState(false);

  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    router.replace(`${pathname}${p.toString() ? `?${p}` : ""}`, { scroll: false });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        label={label}
        value={custom || customOpen ? "custom" : preset}
        onChange={(v) => {
          if (v === "custom") {
            setCustomOpen(true);
            return;
          }
          setCustomOpen(false);
          go({ callRange: v === "7d" ? null : v, callFrom: null, callTo: null });
        }}
        options={[
          { value: "24h", label: "24h" },
          { value: "7d", label: "7d" },
          { value: "30d", label: "30d" },
          { value: "custom", label: "Custom" },
        ]}
      />
      {(custom || customOpen) && <DateRangeFields from={custom?.from ?? ""} to={custom?.to ?? ""} today={today} onApply={(from, to) => go({ callRange: "custom", callFrom: from, callTo: to })} />}
    </div>
  );
}
