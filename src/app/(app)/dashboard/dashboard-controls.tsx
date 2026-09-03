"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Segmented } from "@/components/ui/controls";
import { Select } from "@/components/ui/input";
import { PLATFORMS } from "@/lib/constants";

export function DashboardControls({ platforms }: { platforms: string[] }) {
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
        value={range}
        onChange={(v) => set({ range: v === "14" ? null : v })}
        options={[
          { value: "7", label: "7d" },
          { value: "14", label: "14d" },
          { value: "30", label: "30d" },
          { value: "90", label: "90d" },
        ]}
      />
      {platforms.length > 0 && (
        <Select value={platform} onChange={(e) => set({ platform: e.target.value || null })} className="h-9 w-auto text-[13px]">
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
