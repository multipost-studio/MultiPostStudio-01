"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { revokeDeviceAction } from "@/app/actions/auth";

export function DeviceRow({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={pending}
      onClick={() =>
        start(async () => {
          const res = await revokeDeviceAction(id);
          toast({ title: res.message ?? res.error ?? "", tone: res.ok ? "success" : "error" });
          router.refresh();
        })
      }
    >
      Sign out
    </Button>
  );
}
