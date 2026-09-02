"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { setOpportunityStatusAction } from "@/app/actions/misc";
import { saveGeneratedIdeaAction } from "@/app/actions/ai";

export function OpportunityCard({
  o,
}: {
  o: { id: string; title: string; rationale: string; type: string; score: number; status: string };
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  const tone = o.score >= 75 ? "success" : o.score >= 60 ? "warning" : "neutral";

  return (
    <div className={cn("rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4", o.status === "dismissed" && "opacity-60")}>
      <div className="flex items-center justify-between">
        <Badge tone="primary">{o.type}</Badge>
        <Badge tone={tone}>Score {o.score}</Badge>
      </div>
      <p className="mt-2 text-[15px] font-medium text-[var(--text)]">{o.title}</p>
      <p className="mt-1 text-[13px] text-[var(--text-muted)]">{o.rationale}</p>
      <div className="mt-3 flex gap-2">
        {o.status === "open" && (
          <>
            <Button
              size="sm"
              loading={pending}
              onClick={() =>
                start(async () => {
                  await saveGeneratedIdeaAction(o.title, `Opportunity (score ${o.score}): ${o.rationale}`);
                  await setOpportunityStatusAction(o.id, "planned");
                  toast({ title: "Added to Ideas & marked planned", tone: "success" });
                  router.refresh();
                })
              }
            >
              Plan this
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => start(async () => { await setOpportunityStatusAction(o.id, "dismissed"); router.refresh(); })}
            >
              Dismiss
            </Button>
          </>
        )}
        {o.status !== "open" && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => start(async () => { await setOpportunityStatusAction(o.id, "open"); router.refresh(); })}
          >
            Reopen
          </Button>
        )}
      </div>
    </div>
  );
}
