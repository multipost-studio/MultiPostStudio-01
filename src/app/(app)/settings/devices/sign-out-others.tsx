"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { revokeOtherDevicesAction } from "@/app/actions/auth";

/** One tap to end every other session: the answer to "I left myself signed in somewhere". */
export function SignOutOthersButton({ count }: { count: number }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={pending}
      onClick={() => {
        if (!window.confirm(`Sign out ${count} other device${count === 1 ? "" : "s"}? You stay signed in here.`)) return;
        start(async () => {
          const res = await revokeOtherDevicesAction();
          toast({ title: res.message ?? res.error ?? "", tone: res.ok ? "success" : "error" });
          router.refresh();
        });
      }}
    >
      Sign out all other devices
    </Button>
  );
}
