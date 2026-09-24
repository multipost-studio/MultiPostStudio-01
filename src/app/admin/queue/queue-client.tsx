"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { confirmDestructive } from "@/components/ui/confirm";
import {
  triggerManualQueueRunAction,
  bulkRetryFailedPublishJobsAction,
  retryPublishJobAction,
  cancelPublishJobAction,
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
}: {
  jobId: string;
  status: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);

  const handleRetry = async () => {
    setBusy("retry");
    const res = await retryPublishJobAction(jobId);
    setBusy(null);
    toast({
      title: res.ok ? res.message ?? "Job re-queued" : "Retry failed",
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
      {(status === "queued" || status === "running") && (
        <Button size="sm" variant="ghost" className="text-[var(--danger)]" loading={busy === "cancel"} onClick={handleCancel}>
          Cancel
        </Button>
      )}
    </div>
  );
}
