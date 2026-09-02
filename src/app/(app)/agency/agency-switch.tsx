"use client";

import { useTransition } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { switchWorkspaceAction } from "@/app/actions/workspace";

export function AgencySwitch({ workspaceId }: { workspaceId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="secondary"
      className="w-full"
      loading={pending}
      onClick={() => start(() => switchWorkspaceAction(workspaceId))}
    >
      Open workspace <ArrowRight size={13} />
    </Button>
  );
}
