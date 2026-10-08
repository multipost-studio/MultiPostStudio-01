"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { revokeDeviceAction } from "@/app/actions/auth";

export function DeviceRow({ id, current = false }: { id: string; current?: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={pending}
      onClick={() => {
        // Signing out this very browser ends the session you are using: say so first.
        if (current && !window.confirm("Sign out of this device? You will need to sign in again.")) return;
        start(async () => {
          const res = await revokeDeviceAction(id);
          toast({ title: res.message ?? res.error ?? "", tone: res.ok ? "success" : "error" });
          router.refresh();
        });
      }}
    >
      Sign out
    </Button>
  );
}
