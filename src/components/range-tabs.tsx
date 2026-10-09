"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Segmented } from "@/components/ui/controls";
import { DateRangeFields } from "@/components/date-range-fields";

/**
 * Preset ranges plus an optional custom date range. Pass `today` (the server's UTC day) to offer "Custom"; the page
 * reads ?range=custom&from=&to= with resolveAnalyticsRange, which validates it again.
 */
export function RangeTabs({ current, custom, today }: { current: number; custom?: { from: string; to: string } | null; today?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [customOpen, setCustomOpen] = React.useState(false);

  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    router.push(`${pathname}?${p.toString()}`);
  };

  const options = [
    { value: "7", label: "7d" },
    { value: "14", label: "14d" },
    { value: "30", label: "30d" },
    { value: "90", label: "90d" },
    ...(today ? [{ value: "custom", label: "Custom" }] : []),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        value={custom || customOpen ? "custom" : String(current)}
        onChange={(v) => {
          if (v === "custom") {
            setCustomOpen(true);
            return;
          }
          setCustomOpen(false);
          go({ range: v, from: null, to: null });
        }}
        options={options}
      />
      {today && (custom || customOpen) && (
        <DateRangeFields from={custom?.from ?? ""} to={custom?.to ?? ""} today={today} onApply={(from, to) => go({ range: "custom", from, to })} />
      )}
    </div>
  );
}
