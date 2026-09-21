"use client";

import { useState, useTransition } from "react";
import type { AnalyticsBrief } from "@/lib/analytics-ai";
import type { Range } from "@/lib/analytics";
import { generateAnalyticsBriefAction } from "@/app/actions/ai";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, RefreshCw, TrendingUp, Lightbulb, Compass, Award } from "lucide-react";
import { useToast } from "@/components/ui/toast";

export function AnalyticsAiBrief({
  initialBrief,
  days,
}: {
  initialBrief: AnalyticsBrief;
  days: Range;
}) {
  const [brief, setBrief] = useState<AnalyticsBrief>(initialBrief);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const handleRefresh = () => {
    startTransition(async () => {
      const res = await generateAnalyticsBriefAction(days);
      if (res.ok && res.data) {
        setBrief(res.data);
        toast({ title: "Executive brief refreshed", tone: "success" });
      } else {
        toast({ title: res.error || "Failed to refresh brief", tone: "error" });
      }
    });
  };

  return (
    <Card className="relative overflow-hidden border-[var(--primary)]/30 bg-gradient-to-br from-[var(--surface)] via-[var(--surface)] to-[var(--primary)]/5">
      <div className="absolute right-0 top-0 -mr-8 -mt-8 h-32 w-32 rounded-full bg-[var(--primary)]/10 blur-2xl pointer-events-none" />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary)]/15 text-[var(--primary)]">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="flex items-center gap-2 text-[16px]">
              AI Strategic Performance Brief
              <Badge tone="primary" className="text-[11px] font-normal">
                {days}d Insight
              </Badge>
            </CardTitle>
            <p className="text-[12px] text-[var(--text-muted)]">
              Executive synthesis and recommendations tailored to your recent content velocity
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleRefresh}
          disabled={isPending}
          className="h-8 gap-1.5 text-[12px]"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
          {isPending ? "Analyzing..." : "Refresh"}
        </Button>
      </CardHeader>

      <CardContent className="space-y-4 pt-2">
        {/* Core summary callout */}
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-sunken)] p-3 text-[14px] leading-relaxed text-[var(--text)]">
          {brief.summary}
        </div>

        {/* Top Badges */}
        {(brief.topPlatform || brief.topFormat) && (
          <div className="flex flex-wrap items-center gap-3 text-[12px]">
            {brief.topPlatform && (
              <div className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-[var(--text-subtle)]">
                <Award className="h-3.5 w-3.5 text-[var(--primary)]" />
                <span>Top Channel:</span>
                <span className="font-semibold uppercase text-[var(--text)]">
                  {brief.topPlatform}
                </span>
              </div>
            )}
            {brief.topFormat && (
              <div className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-[var(--text-subtle)]">
                <Compass className="h-3.5 w-3.5 text-[var(--success)]" />
                <span>Highest Yield Format:</span>
                <span className="font-semibold text-[var(--text)]">{brief.topFormat}</span>
              </div>
            )}
          </div>
        )}

        {/* Highlights & Recommendations Grid */}
        <div className="grid gap-4 sm:grid-cols-2">
          {brief.highlights.length > 0 && (
            <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border)] p-3.5">
              <div className="flex items-center gap-1.5 font-medium text-[13px] text-[var(--text)]">
                <TrendingUp className="h-4 w-4 text-[var(--primary)]" />
                <span>Key Trajectory Highlights</span>
              </div>
              <ul className="space-y-1.5 text-[13px] text-[var(--text-muted)]">
                {brief.highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)]" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {brief.recommendations.length > 0 && (
            <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border)] p-3.5">
              <div className="flex items-center gap-1.5 font-medium text-[13px] text-[var(--text)]">
                <Lightbulb className="h-4 w-4 text-[var(--warning)]" />
                <span>Strategic Action Recommendations</span>
              </div>
              <ul className="space-y-1.5 text-[13px] text-[var(--text-muted)]">
                {brief.recommendations.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--warning)]" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
