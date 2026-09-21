"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import type { SystemHealthReport, ProbeStatus } from "@/lib/health-check";
import { triggerHealthProbesAction } from "@/app/actions/admin-health";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import {
  HeartPulse,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Database,
  HardDrive,
  Cpu,
  ShieldCheck,
  Mail,
  Zap,
  Activity,
  ArrowRight,
} from "lucide-react";

export function HealthDashboardClient({
  initialReport,
}: {
  initialReport: SystemHealthReport;
}) {
  const { toast } = useToast();
  const [report, setReport] = useState<SystemHealthReport>(initialReport);
  const [isPending, startTransition] = useTransition();
  const [autoRefresh, setAutoRefresh] = useState(false);

  const handleRefresh = () => {
    startTransition(async () => {
      const res = await triggerHealthProbesAction();
      if (res.ok && res.data) {
        setReport(res.data);
        toast({ title: "Health diagnostics updated", tone: "success" });
      } else {
        toast({ title: "Failed to update diagnostics", tone: "error" });
      }
    });
  };

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      handleRefresh();
    }, 30_000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const getStatusIcon = (status: ProbeStatus) => {
    switch (status) {
      case "healthy":
        return <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />;
      case "degraded":
        return <AlertTriangle className="h-4 w-4 text-[var(--warning)]" />;
      case "unhealthy":
        return <XCircle className="h-4 w-4 text-[var(--danger)]" />;
    }
  };

  const getStatusTone = (status: ProbeStatus): "success" | "warning" | "danger" => {
    switch (status) {
      case "healthy":
        return "success";
      case "degraded":
        return "warning";
      case "unhealthy":
        return "danger";
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "core":
        return <Database className="h-4 w-4 text-[var(--primary)]" />;
      case "infrastructure":
        return <HardDrive className="h-4 w-4 text-[var(--primary)]" />;
      case "integration":
        return <Zap className="h-4 w-4 text-[var(--primary)]" />;
      case "security":
        return <ShieldCheck className="h-4 w-4 text-[var(--primary)]" />;
      default:
        return <Cpu className="h-4 w-4 text-[var(--primary)]" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-bold text-[var(--text)] flex items-center gap-2">
            <HeartPulse className="h-5 w-5 text-[var(--primary)]" />
            System Health &amp; Readiness Probes
          </h1>
          <p className="text-[13px] text-[var(--text-muted)]">
            Live infrastructure diagnostics verifying database round-trip latency, worker heartbeat, and encryption keys.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setAutoRefresh((v) => !v)}
            className={`text-[12px] gap-1.5 ${autoRefresh ? "border-[var(--primary)] text-[var(--primary)]" : ""}`}
          >
            <Activity size={13} /> {autoRefresh ? "Auto-refreshing (30s)" : "Auto-refresh: Off"}
          </Button>
          <Button
            size="sm"
            onClick={handleRefresh}
            disabled={isPending}
            className="text-[12px] gap-1.5"
          >
            <RefreshCw size={13} className={isPending ? "animate-spin" : ""} />
            {isPending ? "Running Probes..." : "Run Probes Now"}
          </Button>
        </div>
      </div>

      {/* Overall Health Summary Banner */}
      <Card className="relative overflow-hidden border-[var(--border)] bg-gradient-to-r from-[var(--surface)] to-[var(--surface-sunken)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-xl border ${
                report.overallStatus === "healthy"
                  ? "border-[var(--success)]/30 bg-[var(--success)]/10 text-[var(--success)]"
                  : report.overallStatus === "degraded"
                  ? "border-[var(--warning)]/30 bg-[var(--warning)]/10 text-[var(--warning)]"
                  : "border-[var(--danger)]/30 bg-[var(--danger)]/10 text-[var(--danger)]"
              }`}
            >
              {getStatusIcon(report.overallStatus)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[18px] font-bold uppercase tracking-tight text-[var(--text)]">
                  System {report.overallStatus}
                </h2>
                <Badge tone={getStatusTone(report.overallStatus)} className="uppercase text-[11px]">
                  {report.overallStatus}
                </Badge>
              </div>
              <p className="text-[12px] text-[var(--text-muted)]">
                Last evaluated at {new Date(report.timestamp).toLocaleTimeString()} ·{" "}
                {report.summary.healthy} of {report.summary.total} probes passing cleanly
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-[13px]">
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-center">
              <span className="block text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">Healthy</span>
              <span className="text-[16px] font-bold text-[var(--success)]">{report.summary.healthy}</span>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-center">
              <span className="block text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">Degraded</span>
              <span className="text-[16px] font-bold text-[var(--warning)]">{report.summary.degraded}</span>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-center">
              <span className="block text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">Unhealthy</span>
              <span className="text-[16px] font-bold text-[var(--danger)]">{report.summary.unhealthy}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Probes Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {report.probes.map((p) => (
          <Card key={p.name} className="flex flex-col justify-between p-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getCategoryIcon(p.category)}
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                    {p.category}
                  </span>
                </div>
                <Badge tone={getStatusTone(p.status)} className="text-[11px] uppercase gap-1 font-mono">
                  {getStatusIcon(p.status)}
                  {p.status}
                </Badge>
              </div>

              <div>
                <h3 className="text-[15px] font-semibold text-[var(--text)]">{p.name}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
                  {p.message}
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-2.5 text-[12px] text-[var(--text-subtle)]">
              <span>Latency:</span>
              <span className="font-mono font-medium text-[var(--text)]">
                {p.latencyMs !== undefined ? `${p.latencyMs}ms` : "Active"}
              </span>
            </div>
          </Card>
        ))}
      </div>

      {/* Cross-Link Footer Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h4 className="text-[14px] font-semibold text-[var(--text)]">Event Observability</h4>
              <p className="text-[12px] text-[var(--text-muted)]">
                Inspect live error velocity and background job telemetry stream.
              </p>
            </div>
            <Button size="sm" variant="secondary" asChild className="gap-1 text-[12px]">
              <Link href="/admin/observability">
                View Stream <ArrowRight size={13} />
              </Link>
            </Button>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h4 className="text-[14px] font-semibold text-[var(--text)]">Queue &amp; Worker Control</h4>
              <p className="text-[12px] text-[var(--text-muted)]">
                Inspect queue depth, failed publish jobs, and retry failed posts.
              </p>
            </div>
            <Button size="sm" variant="secondary" asChild className="gap-1 text-[12px]">
              <Link href="/admin/system">
                Queue Manager <ArrowRight size={13} />
              </Link>
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
