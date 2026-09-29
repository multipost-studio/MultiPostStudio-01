"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, LogOut } from "lucide-react";
import { stopImpersonatingAction } from "@/app/actions/impersonation";
import { Button } from "@/components/ui/button";

export function ImpersonationBanner({
  userName,
  userEmail,
  adminName,
}: {
  userName: string;
  userEmail: string;
  adminName?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleStop = () => {
    startTransition(async () => {
      const res = await stopImpersonatingAction();
      if (res.ok) {
        router.push(res.redirectTo || "/admin/users");
        router.refresh();
      }
    });
  };

  return (
    <div className="sticky top-0 z-50 flex min-w-0 flex-wrap items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-[13px] font-medium text-amber-950 shadow-md">
      <div className="flex min-w-0 items-center gap-2">
        <Eye className="h-4 w-4 shrink-0 animate-pulse text-amber-950" />
        <span className="min-w-0 break-words">
          <strong>Admin Impersonation Mode:</strong> You are viewing MultiPost Studio as{" "}
          <span className="font-semibold underline">{userName}</span> ({userEmail})
          {adminName ? ` · Logged in as staff ${adminName}` : ""}
        </span>
      </div>
      <Button
        size="sm"
        variant="secondary"
        onClick={handleStop}
        disabled={isPending}
        className="h-8 shrink-0 bg-amber-950 text-white hover:bg-amber-900 border-none text-[13px] gap-1.5 font-semibold"
      >
        <LogOut size={13} />
        {isPending ? "Exiting..." : "Exit Impersonation"}
      </Button>
    </div>
  );
}
