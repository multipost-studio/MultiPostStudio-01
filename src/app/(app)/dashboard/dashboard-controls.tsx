"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DateRangeFields } from "@/components/date-range-fields";
import { Segmented } from "@/components/ui/controls";
import { Select } from "@/components/ui/input";
import { PLATFORMS } from "@/lib/constants";

export function DashboardControls({ platforms, custom = null, today }: { platforms: string[]; custom?: { from: string; to: string } | null; today?: string }) {
  const [customOpen, setCustomOpen] = React.useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const range = params.get("range") ?? "14";
  const platform = params.get("platform") ?? "";

  const set = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v) p.delete(k);
      else p.set(k, v);
    }
    router.replace(`${pathname}${p.toString() ? `?${p}` : ""}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        value={custom || customOpen ? "custom" : range}
        onChange={(v) => {
          if (v === "custom") {
            setCustomOpen(true);
            return;
          }
          setCustomOpen(false);
          set({ range: v === "14" ? null : v, from: null, to: null });
        }}
        options={[
          { value: "7", label: "7d" },
          { value: "14", label: "14d" },
          { value: "30", label: "30d" },
          { value: "90", label: "90d" },
          ...(today ? [{ value: "custom", label: "Custom" }] : []),
        ]}
      />
      {today && (custom || customOpen) && <DateRangeFields from={custom?.from ?? ""} to={custom?.to ?? ""} today={today} onApply={(from, to) => set({ range: "custom", from, to })} />}
      {platforms.length > 0 && (
        <Select aria-label="Filter by platform" value={platform} onChange={(e) => set({ platform: e.target.value || null })} size="sm" className="w-auto">
          <option value="">All platforms</option>
          {platforms.map((p) => (
            <option key={p} value={p}>
              {PLATFORMS[p as keyof typeof PLATFORMS]?.label ?? p}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}
