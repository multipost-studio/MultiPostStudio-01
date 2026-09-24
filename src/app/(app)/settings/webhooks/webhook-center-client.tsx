"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { WEBHOOK_EVENTS } from "@/lib/constants";
import {
  getStatusCodeTone,
  formatWebhookPayloadPreview,
  type WebhookStats,
} from "@/lib/webhook-center";
import {
  replayWebhookDeliveryAction,
  toggleWebhookActiveAction,
  getWebhookSecretAction,
} from "@/app/actions/webhooks";
import {
  createWebhookAction,
  deleteWebhookAction,
  testWebhookAction,
} from "@/app/actions/integrations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/controls";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { relativeTime } from "@/lib/utils";
import {
  Webhook as WebhookIcon,
  Plus,
  Send,
  Trash2,
  Play,
  Key,
  Copy,
  ExternalLink,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
} from "lucide-react";

interface WebhookItem {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
  lastDelivery: {
    success: boolean;
    statusCode: number | null;
    createdAt: string;
  } | null;
}

interface DeliveryItem {
  id: string;
  webhookId: string;
  webhookUrl: string;
  event: string;
  payload: string;
  statusCode: number | null;
  success: boolean;
  error: string | null;
  createdAt: string;
}

export function WebhookCenterClient({
  canManage,
  stats,
  initialWebhooks,
  initialDeliveries,
}: {
  canManage: boolean;
  stats: WebhookStats;
  initialWebhooks: WebhookItem[];
  initialDeliveries: DeliveryItem[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [activeTab, setActiveTab] = useState<"endpoints" | "deliveries">("deliveries");
  const [createOpen, setCreateOpen] = useState(false);
  const [inspectDelivery, setInspectDelivery] = useState<DeliveryItem | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<{ id: string; secret: string } | null>(null);

  // New webhook form state
  const [newUrl, setNewUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([
    "post.published",
    "post.failed",
  ]);

  const handleCreateWebhook = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl) {
      toast({ title: "Enter a valid URL", tone: "error" });
      return;
    }
    if (selectedEvents.length === 0) {
      toast({ title: "Select at least one event", tone: "error" });
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.append("url", newUrl);
      selectedEvents.forEach((ev) => fd.append("events", ev));

      const res = await createWebhookAction(null, fd);
      if (res.ok) {
        toast({ title: "Webhook endpoint registered", tone: "success" });
        setCreateOpen(false);
        setNewUrl("");
        router.refresh();
      } else {
        toast({ title: res.error || "Failed to create webhook", tone: "error" });
      }
    });
  };

  const handleToggleActive = (id: string, current: boolean) => {
    startTransition(async () => {
      const res = await toggleWebhookActiveAction(id, !current);
      if (res.ok) {
        toast({ title: res.message || "Updated", tone: "success" });
        router.refresh();
      } else {
        toast({ title: res.error || "Failed to update", tone: "error" });
      }
    });
  };

  const handleTestPing = (id: string) => {
    startTransition(async () => {
      const res = await testWebhookAction(id);
      if (res.ok) {
        toast({ title: res.message || "Test event delivered", tone: "success" });
        router.refresh();
      } else {
        toast({ title: res.error || "Test failed", tone: "error" });
      }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Are you sure you want to delete this webhook endpoint?")) return;
    startTransition(async () => {
      const res = await deleteWebhookAction(id);
      if (res.ok) {
        toast({ title: "Webhook deleted", tone: "success" });
        router.refresh();
      } else {
        toast({ title: res.error || "Failed to delete", tone: "error" });
      }
    });
  };

  const handleRevealSecret = async (id: string) => {
    const res = await getWebhookSecretAction(id);
    if (res.ok && res.data) {
      setRevealedSecret({ id, secret: res.data.secret });
    } else {
      toast({ title: res.error || "Could not read signing secret", tone: "error" });
    }
  };

  const handleReplay = (deliveryId: string) => {
    startTransition(async () => {
      const res = await replayWebhookDeliveryAction(deliveryId);
      if (res.ok) {
        toast({ title: res.message || "Redelivered successfully", tone: "success" });
        setInspectDelivery(null);
        router.refresh();
      } else {
        toast({ title: res.error || "Replay delivery failed", tone: "error" });
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-bold text-[var(--text)] flex items-center gap-2">
            <WebhookIcon className="h-5 w-5 text-[var(--primary)]" />
            Webhook Center & Delivery Inspector
          </h1>
          <p className="text-[13px] text-[var(--text-muted)]">
            Manage real-time event subscriptions, inspect delivery responses, and replay failed payloads.
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus size={14} /> New Endpoint
          </Button>
        )}
      </div>

      {/* Quick Metrics Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Total Deliveries
          </p>
          <p className="mt-1 text-[22px] font-bold text-[var(--text)]">
            {stats.totalDeliveries}
          </p>
        </Card>
        <Card className="p-3.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Delivery Success Rate
          </p>
          <p className="mt-1 text-[22px] font-bold text-[var(--success)]">
            {stats.successRate}%
          </p>
        </Card>
        <Card className="p-3.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Failed Invocations
          </p>
          <p className="mt-1 text-[22px] font-bold text-[var(--danger)]">
            {stats.failedDeliveries}
          </p>
        </Card>
        <Card className="p-3.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Active Endpoints
          </p>
          <p className="mt-1 text-[22px] font-bold text-[var(--primary)]">
            {initialWebhooks.filter((w) => w.active).length} / {initialWebhooks.length}
          </p>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)] gap-6 text-[14px]">
        <button
          type="button"
          onClick={() => setActiveTab("deliveries")}
          className={`pb-2.5 font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
            activeTab === "deliveries"
              ? "border-[var(--primary)] text-[var(--primary)]"
              : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
          }`}
        >
          <Clock size={15} /> Delivery Logs ({initialDeliveries.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("endpoints")}
          className={`pb-2.5 font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
            activeTab === "endpoints"
              ? "border-[var(--primary)] text-[var(--primary)]"
              : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
          }`}
        >
          <WebhookIcon size={15} /> Registered Endpoints ({initialWebhooks.length})
        </button>
      </div>

      {/* Deliveries Tab Content */}
      {activeTab === "deliveries" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-[15px]">Recent Delivery Logs</CardTitle>
            <span className="text-[12px] text-[var(--text-muted)]">
              Click any delivery to inspect its JSON body or trigger an instant replay.
            </span>
          </CardHeader>
          <CardContent>
            {initialDeliveries.length === 0 ? (
              <div className="p-8 text-center text-[13px] text-[var(--text-muted)]">
                No webhook deliveries recorded yet. Configure an endpoint and send a test ping to populate logs.
              </div>
            ) : (
              <div className="overflow-x-auto mps-scroll-x" tabIndex={0} role="region" aria-label="Webhook delivery logs">
                <table className="w-full min-w-[650px] text-[13px]">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-[var(--text-subtle)]">
                      <th className="py-2 font-medium">Status</th>
                      <th className="py-2 font-medium">Event</th>
                      <th className="py-2 font-medium">Endpoint Target</th>
                      <th className="py-2 font-medium">Payload Preview</th>
                      <th className="py-2 text-right font-medium">Sent</th>
                      <th className="py-2 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {initialDeliveries.map((d) => {
                      const tone = getStatusCodeTone(d.statusCode, d.success);
                      return (
                        <tr
                          key={d.id}
                          className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-hover)]"
                        >
                          <td className="py-2.5">
                            <Badge tone={tone} className="font-mono text-[11px]">
                              {d.statusCode ? `HTTP ${d.statusCode}` : "ERR"}
                            </Badge>
                          </td>
                          <td className="py-2.5 font-medium text-[var(--text)]">
                            {d.event}
                          </td>
                          <td className="py-2.5 max-w-[180px] truncate font-mono text-[12px] text-[var(--text-muted)]">
                            {d.webhookUrl}
                          </td>
                          <td className="py-2.5 max-w-[220px] truncate text-[12px] text-[var(--text-subtle)]">
                            {formatWebhookPayloadPreview(d.payload)}
                          </td>
                          <td className="py-2.5 text-right whitespace-nowrap text-[12px] text-[var(--text-muted)]">
                            {relativeTime(d.createdAt)}
                          </td>
                          <td className="py-2.5 text-right whitespace-nowrap space-x-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setInspectDelivery(d)}
                              className="h-7 px-2 text-[12px]"
                            >
                              Inspect
                            </Button>
                            {canManage && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleReplay(d.id)}
                                disabled={isPending}
                                className="h-7 px-2 text-[12px] gap-1"
                              >
                                <RotateCcw size={11} /> Replay
                              </Button>
                            )}
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
      )}

      {/* Endpoints Tab Content */}
      {activeTab === "endpoints" && (
        <div className="space-y-4">
          {initialWebhooks.length === 0 ? (
            <Card className="p-8 text-center text-[13px] text-[var(--text-muted)]">
              No webhook endpoints configured. Add an endpoint to begin receiving automated platform events.
            </Card>
          ) : (
            initialWebhooks.map((w) => (
              <Card key={w.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[14px] font-semibold text-[var(--text)]">
                        {w.url}
                      </span>
                      <Badge tone={w.active ? "success" : "neutral"} dot>
                        {w.active ? "Active" : "Paused"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {w.events.map((ev) => (
                        <span
                          key={ev}
                          className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[11px] font-mono text-[var(--text-muted)]"
                        >
                          {ev}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {canManage && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRevealSecret(w.id)}
                          className="h-8 gap-1.5 text-[12px]"
                        >
                          <Key size={13} /> Secret
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleToggleActive(w.id, w.active)}
                          disabled={isPending}
                          className="h-8 text-[12px]"
                        >
                          {w.active ? "Pause" : "Activate"}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleTestPing(w.id)}
                          disabled={isPending}
                          className="h-8 gap-1 text-[12px]"
                        >
                          <Send size={12} /> Test Ping
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(w.id)}
                          disabled={isPending}
                          className="h-8 w-8 text-[var(--danger)] hover:bg-[var(--danger)]/10"
                        >
                          <Trash2 size={13} />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Secret reveal card if active for this hook */}
                {revealedSecret?.id === w.id && (
                  <div className="mt-3 flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--primary)]/40 bg-[var(--primary)]/5 p-2.5">
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={14} className="text-[var(--primary)]" />
                      <span className="text-[12px] font-medium text-[var(--text-muted)]">Signing Secret:</span>
                      <code className="font-mono text-[12px] text-[var(--text)]">{revealedSecret.secret}</code>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(revealedSecret.secret);
                        toast({ title: "Secret copied to clipboard", tone: "success" });
                      }}
                      className="h-7 text-[11px] gap-1"
                    >
                      <Copy size={12} /> Copy
                    </Button>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      )}

      {/* Inspect Delivery Modal */}
      {inspectDelivery && (
        <Modal
          open={!!inspectDelivery}
          onClose={() => setInspectDelivery(null)}
          title={`Delivery Inspection · ${inspectDelivery.event}`}
          size="lg"
          footer={
            <div className="flex items-center justify-between w-full">
              <span className="text-[12px] text-[var(--text-muted)] font-mono">
                {inspectDelivery.webhookUrl}
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setInspectDelivery(null)}>
                  Close
                </Button>
                {canManage && (
                  <Button
                    size="sm"
                    onClick={() => handleReplay(inspectDelivery.id)}
                    disabled={isPending}
                    className="gap-1.5"
                  >
                    <RotateCcw size={13} /> Replay Payload
                  </Button>
                )}
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-sunken)] p-3">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-[var(--text-subtle)]">Response Status</span>
                <p className="text-[14px] font-semibold text-[var(--text)]">
                  {inspectDelivery.statusCode ? `HTTP ${inspectDelivery.statusCode}` : "Connection Failure"}
                </p>
              </div>
              <div>
                <span className="text-[11px] uppercase tracking-wider text-[var(--text-subtle)]">Timestamp</span>
                <p className="text-[13px] text-[var(--text-muted)]">
                  {new Date(inspectDelivery.createdAt).toLocaleString()}
                </p>
              </div>
            </div>

            {inspectDelivery.error && (
              <div className="rounded-[var(--radius-md)] border border-[var(--danger)]/30 bg-[var(--danger)]/10 p-3 text-[13px] text-[var(--danger)]">
                <strong>Error Details:</strong> {inspectDelivery.error}
              </div>
            )}

            <div>
              <span className="text-[12px] font-semibold text-[var(--text)] mb-1.5 block">
                Signed JSON Body
              </span>
              <pre className="max-h-[300px] overflow-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-sunken)] p-3 font-mono text-[12px] text-[var(--text)] mps-scroll-x">
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(inspectDelivery.payload), null, 2);
                  } catch {
                    return inspectDelivery.payload;
                  }
                })()}
              </pre>
            </div>
          </div>
        </Modal>
      )}

      {/* Create Webhook Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Register Webhook Endpoint"
        size="md"
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateWebhook} disabled={isPending}>
              {isPending ? "Registering..." : "Create Endpoint"}
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateWebhook} className="space-y-4">
          <Field label="Destination Endpoint URL">
            <Input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://api.yourdomain.com/webhooks/multipost-studio"
              required
            />
            <p className="mt-1 text-[11px] text-[var(--text-subtle)]">
              Must be an active HTTPS URL reachable via public internet.
            </p>
          </Field>

          <div>
            <p className="mb-2 text-[13px] font-semibold text-[var(--text)]">
              Subscribed Event Triggers
            </p>
            <div className="space-y-2">
              {WEBHOOK_EVENTS.map((ev) => (
                <Checkbox
                  key={ev}
                  label={ev}
                  checked={selectedEvents.includes(ev)}
                  onCheckedChange={(checked) => {
                    setSelectedEvents((prev) =>
                      checked ? [...prev, ev] : prev.filter((x) => x !== ev),
                    );
                  }}
                />
              ))}
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
