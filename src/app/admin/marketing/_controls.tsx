"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Segmented } from "@/components/ui/controls";
import { DateRangeFields } from "@/components/date-range-fields";
import type { GroupBy, Touch } from "@/lib/marketing-report";

const GROUPS: { value: GroupBy; label: string }[] = [
  { value: "channel", label: "Channel" },
  { value: "source", label: "Source" },
  { value: "medium", label: "Medium" },
  { value: "campaign", label: "Campaign" },
  { value: "landing", label: "Landing page" },
  { value: "referrer", label: "Referrer" },
];

/** Range, grouping and touch model live in the URL so a view can be shared and survives refresh. */
export function AcquisitionControls({ days, custom, today, by, touch }: { days: number; custom: { from: string; to: string } | null; today: string; by: GroupBy; touch: Touch }) {
  const [customOpen, setCustomOpen] = React.useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = (patch: Record<string, string | null>) => {
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
        label="Date range"
        value={custom || customOpen ? "custom" : String(days)}
        onChange={(v) => {
          if (v === "custom") {
            setCustomOpen(true);
            return;
          }
          setCustomOpen(false);
          set({ days: v === "30" ? null : v, from: null, to: null });
        }}
        options={[
          { value: "7", label: "7d" },
          { value: "30", label: "30d" },
          { value: "90", label: "90d" },
          { value: "custom", label: "Custom" },
        ]}
      />
      {(custom || customOpen) && <DateRangeFields from={custom?.from ?? ""} to={custom?.to ?? ""} today={today} onApply={(from, to) => set({ days: "custom", from, to })} />}
      <Segmented
        label="Attribute signups to"
        value={touch}
        onChange={(v) => set({ touch: v === "first" ? null : v })}
        options={[
          { value: "first", label: "First touch" },
          { value: "last", label: "Last touch" },
        ]}
      />
      <Segmented label="Group by" value={by} onChange={(v) => set({ by: v === "channel" ? null : v })} options={GROUPS} />
    </div>
  );
}
