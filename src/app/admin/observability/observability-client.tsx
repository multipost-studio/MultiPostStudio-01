"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ObservabilitySummary, EventLevel, EventSource } from "@/lib/observe";
import {
  emitDiagnosticEventAction,
  clearSystemEventsAction,
  deleteSystemEventAction,
  type PurgeEventsOptions,
} from "@/app/actions/admin-observability";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { Dropdown, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/dropdown";
import { useConfirm } from "@/components/ui/confirm";
import { relativeTime } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  AlertCircle,
  Info,
  Radio,
  Trash2,
  Filter,
  Search,
  CheckCircle2,
  RefreshCw,
  Clock,
  ChevronDown,
  X,
} from "lucide-react";

interface TelemetryEvent {
  id: string;
  level: string;
  source: string;
  message: string;
  createdAt: string;
}

export function ObservabilityClient({
  metrics,
  initialEvents,
}: {
  metrics: ObservabilitySummary;
  initialEvents: TelemetryEvent[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();

  const [selectedLevel, setSelectedLevel] = useState<string>("all");
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);

  // Diagnostic form state
  const [diagLevel, setDiagLevel] = useState<EventLevel>("warn");
  const [diagSource, setDiagSource] = useState<EventSource>("system");
  const [diagMessage, setDiagMessage] = useState("");

  const filteredEvents = useMemo(() => {
    return initialEvents.filter((e) => {
      if (selectedLevel !== "all" && e.level !== selectedLevel) return false;
      if (selectedSource !== "all" && e.source !== selectedSource) return false;
      if (
        searchQuery &&
        !e.message.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !e.source.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [initialEvents, selectedLevel, selectedSource, searchQuery]);

  const handleEmitDiagnostic = (e: React.FormEvent) => {
    e.preventDefault();
    if (!diagMessage.trim()) return;

    startTransition(async () => {
      const res = await emitDiagnosticEventAction(diagLevel, diagSource, diagMessage);
      if (res.ok) {
        toast({ title: "Diagnostic event dispatched", tone: "success" });
        setDiagnosticOpen(false);
        setDiagMessage("");
        router.refresh();
      } else {
        toast({ title: res.error || "Failed to dispatch", tone: "error" });
      }
    });
  };

  const handlePurgeWithOptions = async (opts: PurgeEventsOptions, description: string) => {
    const isDestructive = !!opts.clearAll || !!opts.onlyErrors;
    const ok = await confirm({
      title: opts.clearAll
        ? opts.onlyErrors
          ? "Clear all critical incidents?"
          : "Clear all telemetry events?"
        : `Purge telemetry events ${description}?`,
      body: opts.clearAll
        ? opts.onlyErrors
          ? "This will delete all critical error events from the telemetry stream and reset the incident counter to 0."
          : "This will permanently delete all telemetry records from the database. This action cannot be undone."
        : `This will remove all telemetry events ${description} from the database.`,
      confirmLabel: opts.clearAll ? "Clear Now" : "Purge Events",
      destructive: isDestructive,
    });
    if (!ok) return;

    startTransition(async () => {
      const res = await clearSystemEventsAction(opts);
      if (res.ok) {
        toast({ title: res.message || "Events purged", tone: "success" });
        router.refresh();
      } else {
        toast({ title: res.error || "Purge failed", tone: "error" });
      }
    });
  };

  const handleDismissEvent = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    startTransition(async () => {
      const res = await deleteSystemEventAction(id);
      if (res.ok) {
        toast({ title: "Event dismissed", tone: "success" });
        router.refresh();
      } else {
        toast({ title: res.error || "Failed to dismiss event", tone: "error" });
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-bold text-[var(--text)] flex items-center gap-2">
            <Activity className="h-5 w-5 text-[var(--primary)]" />
            System Observability &amp; Event Telemetry
          </h1>
          <p className="text-[13px] text-[var(--text-muted)]">
            Live telemetry stream capturing background workers, webhooks, auth events, and error velocity.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => router.refresh()}
            className="gap-1.5 text-[12px]"
          >
            <RefreshCw size={13} /> Refresh
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setDiagnosticOpen(true)}
            className="gap-1.5 text-[12px]"
          >
            <Radio size={13} /> Test Ping
          </Button>
          <Dropdown
            align="end"
            trigger={
              <Button
                size="sm"
                variant="secondary"
                disabled={isPending}
                className="gap-1.5 text-[12px]"
              >
                <Trash2 size={13} />
                Prune &amp; Clean
                <ChevronDown size={12} className="text-[var(--text-muted)]" />
              </Button>
            }
          >
            <MenuLabel>Time-based Pruning</MenuLabel>
            <MenuItem onClick={() => handlePurgeWithOptions({ olderThanHours: 24 }, "older than 24 hours")}>
              <Clock size={13} className="text-[var(--text-muted)]" />
              Prune &gt; 24 hours
            </MenuItem>
            <MenuItem onClick={() => handlePurgeWithOptions({ olderThanDays: 7 }, "older than 7 days")}>
              <Clock size={13} className="text-[var(--text-muted)]" />
              Prune &gt; 7 days
            </MenuItem>
            <MenuItem onClick={() => handlePurgeWithOptions({ olderThanDays: 30 }, "older than 30 days")}>
              <Clock size={13} className="text-[var(--text-muted)]" />
              Prune &gt; 30 days
            </MenuItem>
            <MenuSeparator />
            <MenuLabel>Incident Reset</MenuLabel>
            <MenuItem
              destructive
              onClick={() => handlePurgeWithOptions({ clearAll: true, onlyErrors: true }, "all errors")}
            >
              <AlertCircle size={13} />
              Clear Critical Incidents (Errors)
            </MenuItem>
            <MenuItem
              destructive
              onClick={() => handlePurgeWithOptions({ clearAll: true }, "all events")}
            >
              <Trash2 size={13} />
              Clear All Telemetry Stream
            </MenuItem>
          </Dropdown>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Telemetry Events
          </p>
          <p className="mt-1 text-[22px] font-bold text-[var(--text)]">
            {metrics.totalEvents}
          </p>
        </Card>
        <Card className="p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--danger)]">
              Critical Incidents
            </p>
            {metrics.errorCount > 0 && (
              <button
                type="button"
                onClick={() => handlePurgeWithOptions({ clearAll: true, onlyErrors: true }, "all errors")}
                disabled={isPending}
                className="text-[11px] font-medium text-[var(--danger)] hover:underline disabled:opacity-50"
              >
                Clear
              </button>
            )}
          </div>
          <p className="mt-1 text-[22px] font-bold text-[var(--danger)]">
            {metrics.errorCount}
          </p>
        </Card>
        <Card className="p-3.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--warning)]">
            Velocity (Last 60m)
          </p>
          <p className="mt-1 text-[22px] font-bold text-[var(--text)]">
            {metrics.errorVelocityPerHour} err/hr
          </p>
        </Card>
        <Card className="p-3.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Warnings Logged
          </p>
          <p className="mt-1 text-[22px] font-bold text-[var(--warning)]">
            {metrics.warnCount}
          </p>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--text-subtle)]" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search event messages or sources..."
              className="pl-9 h-9 text-[13px]"
            />
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="h-9 text-[13px]"
            >
              <option value="all">All Levels</option>
              <option value="error">Errors Only</option>
              <option value="warn">Warnings Only</option>
              <option value="info">Info Only</option>
            </Select>

            <Select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="h-9 text-[13px]"
            >
              <option value="all">All Sources</option>
              <option value="queue">Queue</option>
              <option value="webhook">Webhook</option>
              <option value="auth">Auth</option>
              <option value="billing">Billing</option>
              <option value="ai">AI</option>
              <option value="api">API</option>
              <option value="system">System</option>
            </Select>
          </div>
        </div>
      </Card>

      {/* Telemetry Stream Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-[15px]">Telemetry Stream</CardTitle>
            <span className="text-[12px] text-[var(--text-muted)]">
              Showing {filteredEvents.length} of {initialEvents.length} events
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {filteredEvents.length === 0 ? (
            <div className="p-8 text-center text-[13px] text-[var(--text-muted)]">
              No telemetry events match your active filters.
            </div>
          ) : (
            <div className="overflow-x-auto mps-scroll-x" tabIndex={0} role="region" aria-label="Telemetry events table">
              <table className="w-full min-w-[600px] text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[var(--text-subtle)]">
                    <th className="py-2 font-medium">Level</th>
                    <th className="py-2 font-medium">Source</th>
                    <th className="py-2 font-medium">Event Message</th>
                    <th className="py-2 text-right font-medium">Recorded</th>
                    <th className="py-2 text-right font-medium w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.map((e) => {
                    const tone =
                      e.level === "error"
                        ? "danger"
                        : e.level === "warn"
                        ? "warning"
                        : "info";

                    const IconCmp =
                      e.level === "error"
                        ? AlertCircle
                        : e.level === "warn"
                        ? AlertTriangle
                        : Info;

                    return (
                      <tr
                        key={e.id}
                        className="group border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-hover)]"
                      >
                        <td className="py-2.5">
                          <Badge tone={tone} className="gap-1 font-mono text-[11px] uppercase">
                            <IconCmp size={11} /> {e.level}
                          </Badge>
                        </td>
                        <td className="py-2.5">
                          <span className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-muted)]">
                            {e.source}
                          </span>
                        </td>
                        <td className="py-2.5 font-mono text-[12px] text-[var(--text)] max-w-[450px] break-words">
                          {e.message}
                        </td>
                        <td className="py-2.5 text-right whitespace-nowrap text-[12px] text-[var(--text-muted)]">
                          {relativeTime(e.createdAt)}
                        </td>
                        <td className="py-2.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(ev) => handleDismissEvent(e.id, ev)}
                            disabled={isPending}
                            title="Dismiss event"
                            className="rounded p-1 text-[var(--text-subtle)] opacity-40 hover:opacity-100 hover:bg-[var(--danger)]/10 hover:text-[var(--danger)] transition-all disabled:opacity-20"
                          >
                            <X size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Diagnostic Event Modal */}
      <Modal
        open={diagnosticOpen}
        onClose={() => setDiagnosticOpen(false)}
        title="Simulate Telemetry Diagnostic Event"
        size="md"
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setDiagnosticOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleEmitDiagnostic} disabled={isPending}>
              {isPending ? "Emitting..." : "Dispatch Event"}
            </Button>
          </>
        }
      >
        <form onSubmit={handleEmitDiagnostic} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Severity Level">
              <Select
                value={diagLevel}
                onChange={(e) => setDiagLevel(e.target.value as EventLevel)}
              >
                <option value="info">Info</option>
                <option value="warn">Warning</option>
                <option value="error">Error</option>
              </Select>
            </Field>

            <Field label="Origin Source">
              <Select
                value={diagSource}
                onChange={(e) => setDiagSource(e.target.value as EventSource)}
              >
                <option value="system">System</option>
                <option value="api">API</option>
                <option value="queue">Queue</option>
                <option value="webhook">Webhook</option>
                <option value="auth">Auth</option>
                <option value="billing">Billing</option>
                <option value="ai">AI</option>
              </Select>
            </Field>
          </div>

          <Field label="Diagnostic Message">
            <Input
              value={diagMessage}
              onChange={(e) => setDiagMessage(e.target.value)}
              placeholder="e.g. Synthetic probe test for background telemetry pipeline"
              required
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
