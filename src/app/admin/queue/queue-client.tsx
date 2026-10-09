"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { confirmDestructive } from "@/components/ui/confirm";
import {
  triggerManualQueueRunAction,
  bulkRetryFailedPublishJobsAction,
  retryPublishJobAction,
  cancelPublishJobAction,
  reschedulePublishJobAction,
} from "@/app/actions/admin";

export function QueueHeaderActions({
  hasFailedJobs,
}: {
  hasFailedJobs: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [running, setRunning] = React.useState(false);
  const [retrying, setRetrying] = React.useState(false);

  const handleTriggerTick = async () => {
    setRunning(true);
    try {
      const res = await triggerManualQueueRunAction();
      toast({
        title: res.ok ? res.message ?? "Cycle complete" : "Trigger failed",
        tone: res.ok ? "success" : "error",
      });
      if (res.ok) router.refresh();
    } finally {
      setRunning(false);
    }
  };

  const handleBulkRetry = async () => {
    if (
      !(await confirmDestructive({
        title: "Bulk Retry Failed Jobs",
        body: "Re-queue all currently failed publishing jobs to run immediately? Use only after confirming external platform APIs or tokens are operational.",
        confirmLabel: "Retry All",
      }))
    ) {
      return;
    }
    setRetrying(true);
    try {
      const res = await bulkRetryFailedPublishJobsAction();
      toast({
        title: res.ok ? res.message ?? "Retried" : "Retry failed",
        tone: res.ok ? "success" : "error",
      });
      if (res.ok) router.refresh();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {hasFailedJobs && (
        <Button size="sm" variant="secondary" loading={retrying} onClick={handleBulkRetry}>
          Retry All Failed
        </Button>
      )}
      <Button size="sm" variant="outline" loading={running} onClick={handleTriggerTick}>
        Trigger Worker Tick
      </Button>
    </div>
  );
}

export function QueueJobRowActions({
  jobId,
  status,
  runAt,
}: {
  jobId: string;
  status: string;
  runAt: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [moving, setMoving] = React.useState(false);
  const [when, setWhen] = React.useState("");

  const openReschedule = () => {
    // datetime-local wants local wall-clock time without a zone
    const d = new Date(runAt);
    const pad = (n: number) => String(n).padStart(2, "0");
    setWhen(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
    setMoving(true);
  };

  const handleReschedule = async () => {
    const d = new Date(when);
    if (Number.isNaN(d.getTime())) {
      toast({ title: "Pick a valid date and time", tone: "error" });
      return;
    }
    setBusy("move");
    const res = await reschedulePublishJobAction(jobId, d.toISOString());
    setBusy(null);
    toast({ title: res.ok ? res.message ?? "Rescheduled" : res.error ?? "Reschedule failed", tone: res.ok ? "success" : "error" });
    if (res.ok) {
      setMoving(false);
      router.refresh();
    }
  };

  const handleRetry = async () => {
    setBusy("retry");
    const res = await retryPublishJobAction(jobId);
    setBusy(null);
    toast({
      title: res.ok ? res.message ?? "Job re-queued" : res.error ?? "Retry failed",
      tone: res.ok ? "success" : "error",
    });
    if (res.ok) router.refresh();
  };

  const handleCancel = async () => {
    if (
      !(await confirmDestructive({
        title: "Cancel Job",
        body: "Cancel this publish job? The post will be returned to draft status.",
        confirmLabel: "Cancel Job",
      }))
    ) {
      return;
    }
    setBusy("cancel");
    const res = await cancelPublishJobAction(jobId);
    setBusy(null);
    toast({
      title: res.ok ? res.message ?? "Job canceled" : "Cancel failed",
      tone: res.ok ? "success" : "error",
    });
    if (res.ok) router.refresh();
  };

  return (
    <div className="flex items-center gap-1.5">
      {(status === "failed" || status === "canceled") && (
        <Button size="sm" variant="ghost" loading={busy === "retry"} onClick={handleRetry}>
          Retry
        </Button>
      )}
      {status === "queued" && (
        <Button size="sm" variant="ghost" onClick={openReschedule}>
          Reschedule
        </Button>
      )}
      {(status === "queued" || status === "running") && (
        <Button size="sm" variant="ghost" className="text-[var(--danger)]" loading={busy === "cancel"} onClick={handleCancel}>
          Cancel
        </Button>
      )}
      <Modal
        open={moving}
        onClose={() => setMoving(false)}
        size="sm"
        title="Reschedule job"
        description="Moves the job and its post to the new time. A job that has already started cannot be moved."
        footer={
          <>
            <Button variant="secondary" onClick={() => setMoving(false)}>Cancel</Button>
            <Button loading={busy === "move"} onClick={handleReschedule}>Reschedule</Button>
          </>
        }
      >
        <Label htmlFor={`resched-${jobId}`}>New time (your local time)</Label>
        <Input id={`resched-${jobId}`} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      </Modal>
    </div>
  );
}
