"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Download, Link2, Trash2, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Select, Field } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";
import {
  createReportAction,
  updateReportScheduleAction,
  toggleReportShareAction,
  runReportAction,
  deleteReportAction,
} from "@/app/actions/reports";

const WIDGETS = [
  ["followers_growth", "Follower growth"],
  ["reach_impressions", "Reach & impressions"],
  ["engagement_rate", "Engagement rate"],
  ["top_posts", "Top posts"],
  ["worst_posts", "Underperforming posts"],
  ["engagement_by_format", "Engagement by format"],
  ["platform_comparison", "Platform comparison"],
  ["campaign_performance", "Campaign performance"],
  ["posting_frequency", "Posting frequency"],
];

function New({ open: initialOpen }: { open?: boolean }) {
  const [open, setOpen] = React.useState(!!initialOpen);
  const [pending, setPending] = React.useState(false);
  const [widgets, setWidgets] = React.useState<string[]>(["followers_growth", "top_posts", "engagement_by_format"]);
  const { toast } = useToast();
  const router = useRouter();

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus size={15} /> New report
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Build a report"
        size="md"
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" type="submit" form="new-report" loading={pending}>Create</Button>
          </>
        }
      >
        <form
          id="new-report"
          className="space-y-4"
          action={async (fd) => {
            widgets.forEach((w) => fd.append("widgets", w));
            setPending(true);
            const res = await createReportAction(null, fd);
            setPending(false);
            toast({ title: res.ok ? "Report created" : "Failed", description: res.error, tone: res.ok ? "success" : "error" });
            if (res.ok) { setOpen(false); router.refresh(); }
          }}
        >
          <Field label="Report name">
            <Input name="name" required placeholder="Monthly performance — Client A" />
          </Field>
          <Field label="Date range">
            <Select name="dateRange" defaultValue="last_30_days">
              <option value="last_7_days">Last 7 days</option>
              <option value="last_30_days">Last 30 days</option>
              <option value="last_90_days">Last 90 days</option>
              <option value="this_month">This month</option>
            </Select>
          </Field>
          <div>
            <p className="mb-1.5 text-[14px] font-medium text-[var(--text)]">Widgets</p>
            <div className="grid grid-cols-2 gap-2">
              {WIDGETS.map(([key, label]) => (
                <Checkbox
                  key={key}
                  checked={widgets.includes(key)}
                  onCheckedChange={(v) => setWidgets((w) => (v ? [...w, key] : w.filter((x) => x !== key)))}
                  label={label}
                />
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-[14px] text-[var(--text)]">
            <input type="checkbox" name="branded" className="accent-[var(--primary)]" defaultChecked />
            White-label (use workspace logo & colors, hide Cadence branding)
          </label>
        </form>
      </Modal>
    </>
  );
}

function Actions({
  id,
  schedule,
  shared,
  shareToken,
}: {
  id: string;
  schedule: string;
  shared: boolean;
  shareToken: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();

  async function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    const res = await fn();
    toast({ title: res.ok ? res.message ?? "Done" : "Failed", description: res.error, tone: res.ok ? "success" : "error" });
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" onClick={() => run(() => runReportAction(id))}>
        <Download size={13} /> Generate
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          toast({ title: "Export queued", description: "PDF & CSV will download when ready (stub).", tone: "info" });
        }}
      >
        <FileDown size={13} /> Export PDF / CSV
      </Button>
      <Select
        value={schedule}
        onChange={(e) => run(() => updateReportScheduleAction(id, e.target.value as "none"))}
        className="h-8 w-auto text-[13px]"
      >
        <option value="none">No schedule</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
      </Select>
      <Button size="sm" variant="ghost" onClick={() => run(() => toggleReportShareAction(id))}>
        <Link2 size={13} /> {shared ? "Disable link" : "Create link"}
      </Button>
      {shared && shareToken && (
        <button
          onClick={() => {
            navigator.clipboard.writeText(`${window.location.origin}/share/report/${shareToken}`);
            toast({ title: "Link copied", tone: "success" });
          }}
          className="text-[12px] text-[var(--primary)] hover:underline"
        >
          Copy share link
        </button>
      )}
      <Button size="icon" variant="ghost" aria-label="Delete report" onClick={() => run(() => deleteReportAction(id))}>
        <Trash2 size={13} />
      </Button>
    </div>
  );
}

// NOTE: named exports, not a namespace object. { A, B } accessed via property
// in a Server Component breaks across the RSC boundary ("Element type is invalid").
export { New as RepNew, Actions as RepActions };
