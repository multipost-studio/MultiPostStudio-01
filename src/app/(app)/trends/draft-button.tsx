"use client";

import { useTransition } from "react";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { saveGeneratedIdeaAction } from "@/app/actions/ai";

export function DraftFromTrendButton({ title, topic }: { title: string; topic: string }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={pending}
      onClick={() =>
        start(async () => {
          const res = await saveGeneratedIdeaAction(title, `Trend: ${topic}`);
          toast({ title: res.message ?? "Saved to Ideas", tone: res.ok ? "success" : "error" });
        })
      }
    >
      <PenLine size={13} /> Add to Ideas
    </Button>
  );
}
