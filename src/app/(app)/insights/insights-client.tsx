"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, X, TrendingUp, Clock, LayoutGrid, Hash, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { regenerateInsightsAction, dismissInsightAction } from "@/app/actions/misc";

const ICON: Record<string, React.ReactNode> = {
  performance: <TrendingUp size={15} />,
  timing: <Clock size={15} />,
  format: <LayoutGrid size={15} />,
  topic: <Hash size={15} />,
  audience: <Users size={15} />,
};

function Regenerate() {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  return (
    <Button
      size="sm"
      loading={pending}
      onClick={() =>
        start(async () => {
          const res = await regenerateInsightsAction();
          toast({ title: res.message ?? "Done", tone: res.ok ? "success" : "error" });
        })
      }
    >
      <RefreshCw size={14} /> Regenerate
    </Button>
  );
}

type Insight = {
  id: string;
  category: string;
  severity: string;
  what: string;
  why: string;
  action: string;
  metricDelta: number | null;
};

function List({ insights }: { insights: Insight[] }) {
  const router = useRouter();
  const [, start] = useTransition();

  return (
    <div className="space-y-3">
      {insights.map((i) => (
        <div key={i.id} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary-soft)] text-[var(--primary)]">
                {ICON[i.category] ?? <TrendingUp size={15} />}
              </span>
              <div>
                <Badge tone={i.severity === "positive" ? "success" : i.severity === "warning" ? "warning" : "info"}>
                  {i.category}
                </Badge>
              </div>
            </div>
            <button
              onClick={() => start(() => { dismissInsightAction(i.id).then(() => router.refresh()); })}
              className="text-[var(--text-subtle)] hover:text-[var(--text)]"
              aria-label="Dismiss"
            >
              <X size={15} />
            </button>
          </div>
          <p className="mt-2 text-[15px] font-semibold text-[var(--text)]">{i.what}</p>
          <div className="mt-2 grid gap-1.5 text-[14px] sm:grid-cols-[auto_1fr] sm:gap-x-3">
            <span className="font-medium text-[var(--text-subtle)]">Why</span>
            <span className="text-[var(--text-muted)]">{i.why}</span>
            <span className="font-medium text-[var(--primary)]">Do next</span>
            <span className="text-[var(--text)]">{i.action}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// NOTE: named exports, not a namespace object. { A, B } accessed via property
// in a Server Component breaks across the RSC boundary ("Element type is invalid").
export { Regenerate as InsRegenerate, List as InsList };
