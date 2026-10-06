"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Eye, Rocket, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Select, Field } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import {
  previewLaunchBatchAction,
  scheduleLaunchBatchAction,
  unscheduleLaunchBatchAction,
  type LaunchPreview,
} from "@/app/actions/blog-launch";

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * One-click launch plan: preview, schedule and (if needed) unschedule the 60
 * ready-written articles — 3 a day, at randomised times. Everything it creates is
 * an ordinary scheduled post you can still edit or reschedule in the blog admin.
 */
export function LaunchBatchCard({ totalPosts }: { totalPosts: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [startDate, setStartDate] = React.useState("");
  const [perDay, setPerDay] = React.useState("3");
  const [preview, setPreview] = React.useState<LaunchPreview | null>(null);
  const [busy, setBusy] = React.useState<null | "preview" | "schedule" | "unschedule">(null);

  async function runPreview() {
    setBusy("preview");
    const res = await previewLaunchBatchAction({ startDate: startDate || undefined, perDay: Number(perDay) });
    setBusy(null);
    if (res.ok && res.preview) setPreview(res.preview);
    else toast({ title: "Couldn't preview", description: res.ok ? res.message : res.error, tone: "error" });
  }

  async function runSchedule() {
    if (!preview) return;
    const ok = await confirm({
      title: `Schedule ${preview.toSchedule} posts?`,
      body: `They will publish ${perDay} a day from ${fmt(preview.items[0].at)} to ${fmt(preview.items[preview.items.length - 1].at)}. You can edit, reschedule or unschedule any of them afterwards.`,
      confirmLabel: "Schedule posts",
      destructive: false,
    });
    if (!ok) return;
    setBusy("schedule");
    const res = await scheduleLaunchBatchAction({ startDate: startDate || undefined, perDay: Number(perDay) });
    setBusy(null);
    if (res.ok) {
      toast({ title: res.message, description: res.errors?.length ? `${res.errors.length} failed — see the blog list.` : undefined, tone: res.failed ? "warning" : "success" });
      setPreview(null);
      router.refresh();
    } else toast({ title: "Couldn't schedule", description: res.error, tone: "error" });
  }

  async function runUnschedule() {
    const ok = await confirm({
      title: "Move scheduled launch posts back to draft?",
      body: "Posts that are already published are not affected.",
      confirmLabel: "Unschedule",
      destructive: false,
    });
    if (!ok) return;
    setBusy("unschedule");
    const res = await unscheduleLaunchBatchAction();
    setBusy(null);
    toast({ title: res.ok ? res.message : "Couldn't unschedule", description: res.ok ? undefined : res.error, tone: res.ok ? "success" : "error" });
    if (res.ok) router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="flex items-center gap-2">
            <Rocket size={18} className="text-[var(--primary)]" aria-hidden /> Launch batch: {totalPosts} SEO / AEO / GEO articles
          </CardTitle>
          <Badge tone="info">Ready to schedule</Badge>
        </div>
        <CardDescription>
          Written for search and AI answers: direct-answer intros, key takeaways, FAQ structured data and clear headings. They publish automatically at the scheduled
          times (3 a day, random times between roughly 9am and 10pm India time) and appear on the public blog without a redeploy.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="First day (UTC)" hint="Leave empty to start tomorrow.">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} min={new Date().toISOString().slice(0, 10)} />
          </Field>
          <Field label="Posts per day">
            <Select value={perDay} onChange={(e) => setPerDay(e.target.value)}>
              <option value="1">1 a day</option>
              <option value="2">2 a day</option>
              <option value="3">3 a day</option>
            </Select>
          </Field>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={runPreview} loading={busy === "preview"}>
              <Eye size={14} aria-hidden /> Preview schedule
            </Button>
          </div>
        </div>

        {preview && (
          <div className="space-y-3">
            <p className="text-[13.5px] text-[var(--text-muted)]" role="status">
              {preview.toSchedule} to schedule · {preview.existing} already in the blog (skipped) · {preview.words.toLocaleString("en-US")} words in total
            </p>
            {preview.items.length > 0 && (
              <div className="max-h-80 overflow-auto rounded-[var(--radius-md)] border border-[var(--border)]">
                <table className="w-full text-left text-[13px]">
                  <thead className="sticky top-0 bg-[var(--bg-sunken)] text-[var(--text-subtle)]">
                    <tr>
                      <th className="px-3 py-2 font-medium">When (your time)</th>
                      <th className="px-3 py-2 font-medium">Article</th>
                      <th className="hidden px-3 py-2 font-medium sm:table-cell">Category</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {preview.items
                      .slice()
                      .sort((a, b) => a.at.localeCompare(b.at))
                      .map((it) => (
                        <tr key={it.slug}>
                          <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-[var(--text-muted)]">{fmt(it.at)}</td>
                          <td className="px-3 py-1.5 text-[var(--text)]">{it.title}</td>
                          <td className="hidden px-3 py-1.5 text-[var(--text-muted)] sm:table-cell">{it.category}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={runSchedule} loading={busy === "schedule"} disabled={preview.toSchedule === 0}>
                <CalendarClock size={14} aria-hidden /> Schedule {preview.toSchedule} posts
              </Button>
            </div>
          </div>
        )}

        <div className="border-t border-[var(--border)] pt-3">
          <Button variant="ghost" size="sm" onClick={runUnschedule} loading={busy === "unschedule"}>
            <Undo2 size={14} aria-hidden /> Unschedule launch posts
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
