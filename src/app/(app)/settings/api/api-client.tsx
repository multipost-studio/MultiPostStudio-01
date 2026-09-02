"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Copy, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";
import { relativeTime } from "@/lib/utils";
import { API_SCOPES, WEBHOOK_EVENTS } from "@/lib/constants";
import {
  createApiKeyAction,
  revokeApiKeyAction,
  createWebhookAction,
  deleteWebhookAction,
  testWebhookAction,
} from "@/app/actions/integrations";

type Key = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revoked: boolean;
  createdAt: string;
};

export function ApiKeysPanel({ keys, canManage }: { keys: Key[]; canManage: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [scopes, setScopes] = React.useState<string[]>(["posts:read"]);
  const [pending, setPending] = React.useState(false);
  const [newKey, setNewKey] = React.useState<string | null>(null);

  return (
    <div className="space-y-3">
      {keys.length === 0 && <p className="text-[14px] text-[var(--text-muted)]">No API keys yet.</p>}
      {keys.map((k) => (
        <div key={k.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border)] p-3">
          <div>
            <p className="text-[14px] font-medium text-[var(--text)]">
              {k.name} {k.revoked && <Badge tone="danger">revoked</Badge>}
            </p>
            <p className="font-mono text-[12px] text-[var(--text-subtle)]">{k.prefix}••••••••</p>
            <p className="text-[12px] text-[var(--text-subtle)]">
              {k.scopes.join(", ")} · {k.lastUsedAt ? `used ${relativeTime(k.lastUsedAt)}` : "never used"}
            </p>
          </div>
          {canManage && !k.revoked && (
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await revokeApiKeyAction(k.id);
                router.refresh();
              }}
            >
              <Trash2 size={13} /> Revoke
            </Button>
          )}
        </div>
      ))}

      {canManage && (
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <Plus size={14} /> Create key
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => { setOpen(false); setNewKey(null); }}
        title="Create API key"
        footer={
          newKey ? (
            <Button size="sm" onClick={() => { setOpen(false); setNewKey(null); router.refresh(); }}>Done</Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="sm" type="submit" form="new-key" loading={pending}>Create</Button>
            </>
          )
        }
      >
        {newKey ? (
          <div className="space-y-2">
            <p className="text-[14px] text-[var(--text)]">Copy this key now — it won&apos;t be shown again.</p>
            <div className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--bg-sunken)] p-2">
              <code className="flex-1 break-all font-mono text-[13px] text-[var(--text)]">{newKey}</code>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Copy"
                onClick={() => {
                  navigator.clipboard.writeText(newKey);
                  toast({ title: "Copied", tone: "success" });
                }}
              >
                <Copy size={14} />
              </Button>
            </div>
          </div>
        ) : (
          <form
            id="new-key"
            className="space-y-3"
            action={async (fd) => {
              scopes.forEach((s) => fd.append("scopes", s));
              setPending(true);
              const res = await createApiKeyAction(null, fd);
              setPending(false);
              if (res.ok && res.data && typeof res.data === "object" && "raw" in res.data) {
                setNewKey((res.data as { raw: string }).raw);
              } else {
                toast({ title: "Failed", description: res.error, tone: "error" });
              }
            }}
          >
            <Field label="Key name">
              <Input name="name" required placeholder="Production key" />
            </Field>
            <div>
              <p className="mb-1.5 text-[14px] font-medium text-[var(--text)]">Scopes</p>
              <div className="grid grid-cols-2 gap-2">
                {API_SCOPES.map((s) => (
                  <Checkbox
                    key={s}
                    checked={scopes.includes(s)}
                    onCheckedChange={(v) => setScopes((c) => (v ? [...c, s] : c.filter((x) => x !== s)))}
                    label={s}
                  />
                ))}
              </div>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

type Hook = {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  deliveries: { id: string; event: string; statusCode: number | null; success: boolean; createdAt: string }[];
};

export function WebhooksPanel({ webhooks, canManage }: { webhooks: Hook[]; canManage: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [events, setEvents] = React.useState<string[]>(["post.published", "post.failed"]);
  const [pending, setPending] = React.useState(false);

  return (
    <div className="space-y-3">
      {webhooks.length === 0 && <p className="text-[14px] text-[var(--text-muted)]">No webhooks configured.</p>}
      {webhooks.map((w) => (
        <div key={w.id} className="rounded-[var(--radius-md)] border border-[var(--border)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="break-all font-mono text-[13px] text-[var(--text)]">{w.url}</p>
            <div className="flex items-center gap-1.5">
              <Badge tone={w.active ? "success" : "neutral"} dot>{w.active ? "active" : "paused"}</Badge>
              {canManage && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const res = await testWebhookAction(w.id);
                      toast({ title: res.message ?? "Sent", tone: "success" });
                      router.refresh();
                    }}
                  >
                    <Send size={12} /> Test
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Delete webhook"
                    onClick={async () => {
                      await deleteWebhookAction(w.id);
                      router.refresh();
                    }}
                  >
                    <Trash2 size={13} />
                  </Button>
                </>
              )}
            </div>
          </div>
          <p className="mt-1 text-[12px] text-[var(--text-subtle)]">{w.events.join(", ")}</p>
          {w.deliveries.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[12px]">
              {w.deliveries.map((d) => (
                <li key={d.id} className="flex items-center gap-2">
                  <span className={d.success ? "text-[var(--success)]" : "text-[var(--danger)]"}>{d.statusCode ?? "—"}</span>
                  <span className="text-[var(--text-muted)]">{d.event}</span>
                  <span className="text-[var(--text-subtle)]">{relativeTime(d.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {canManage && (
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <Plus size={14} /> Add webhook
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add webhook"
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" type="submit" form="new-hook" loading={pending}>Add</Button>
          </>
        }
      >
        <form
          id="new-hook"
          className="space-y-3"
          action={async (fd) => {
            events.forEach((e) => fd.append("events", e));
            setPending(true);
            const res = await createWebhookAction(null, fd);
            setPending(false);
            toast({ title: res.ok ? "Webhook created" : "Failed", description: res.error, tone: res.ok ? "success" : "error" });
            if (res.ok) { setOpen(false); router.refresh(); }
          }}
        >
          <Field label="Endpoint URL">
            <Input name="url" type="url" required placeholder="https://hooks.yourapp.com/cadence" />
          </Field>
          <div>
            <p className="mb-1.5 text-[14px] font-medium text-[var(--text)]">Events</p>
            <div className="grid grid-cols-2 gap-2">
              {WEBHOOK_EVENTS.map((e) => (
                <Checkbox
                  key={e}
                  checked={events.includes(e)}
                  onCheckedChange={(v) => setEvents((c) => (v ? [...c, e] : c.filter((x) => x !== e)))}
                  label={e}
                />
              ))}
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
