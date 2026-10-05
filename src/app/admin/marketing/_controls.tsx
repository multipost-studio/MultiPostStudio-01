"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Segmented } from "@/components/ui/controls";
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
export function AcquisitionControls({ days, by, touch }: { days: number; by: GroupBy; touch: Touch }) {
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
        value={String(days)}
        onChange={(v) => set({ days: v === "30" ? null : v })}
        options={[
          { value: "7", label: "7d" },
          { value: "30", label: "30d" },
          { value: "90", label: "90d" },
        ]}
      />
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
