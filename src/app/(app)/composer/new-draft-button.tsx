"use client";

import { useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createDraftAction } from "@/app/actions/posts";

export function NewDraftButton() {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" loading={pending} onClick={() => start(() => createDraftAction())}>
      <Plus size={15} /> New post
    </Button>
  );
}
