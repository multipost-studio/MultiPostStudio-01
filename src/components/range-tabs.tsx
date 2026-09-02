"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Segmented } from "@/components/ui/controls";

export function RangeTabs({ current }: { current: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <Segmented
      value={String(current)}
      onChange={(v) => {
        const p = new URLSearchParams(params);
        p.set("range", v);
        router.push(`${pathname}?${p.toString()}`);
      }}
      options={[
        { value: "7", label: "7d" },
        { value: "14", label: "14d" },
        { value: "30", label: "30d" },
        { value: "90", label: "90d" },
      ]}
    />
  );
}
