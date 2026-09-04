"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { refreshOpportunitiesAction } from "@/app/actions/misc";

export function RefreshOpportunitiesButton({ variant }: { variant?: "secondary" | "ghost" }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant={variant}
      loading={pending}
      onClick={() =>
        start(async () => {
          const res = await refreshOpportunitiesAction();
          toast({ title: res.message ?? res.error ?? "Done", tone: res.ok ? "success" : "error" });
          if (res.ok) router.refresh();
        })
      }
    >
      <RefreshCw size={14} /> Find opportunities
    </Button>
  );
}
