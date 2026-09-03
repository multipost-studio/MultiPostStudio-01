"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Select, Input, Textarea, Field } from "@/components/ui/input";
import { Switch } from "@/components/ui/controls";
import { Modal } from "@/components/ui/modal";
import { useAdminAction } from "./admin-client";
import {
  setInvoiceStatusAction,
  setSubscriptionStatusAction,
  adminArchivePostAction,
  adminDisconnectSocialAction,
  revokeApiKeyAction,
  setWebhookActiveAction,
  retryPublishJobAction,
  cancelPublishJobAction,
  broadcastNotificationAction,
  createCouponAction,
  setCouponActiveAction,
  deleteCouponAction,
} from "@/app/actions/admin";

/* ---------------- Billing ---------------- */

export function InvoiceActions({ id, status }: { id: string; status: string }) {
  const { busy, run } = useAdminAction();
  return (
    <div className="flex flex-wrap gap-1.5">
      {status !== "paid" && (
        <Button size="sm" variant="ghost" loading={busy === "paid"} onClick={() => run("paid", () => setInvoiceStatusAction(id, "paid"))}>
          Mark paid
        </Button>
      )}
      {status !== "open" && (
        <Button size="sm" variant="ghost" loading={busy === "open"} onClick={() => run("open", () => setInvoiceStatusAction(id, "open"))}>
          Reopen
        </Button>
      )}
      {status !== "void" && (
        <Button
          size="sm"
          variant="ghost"
          loading={busy === "void"}
          onClick={() => run("void", () => setInvoiceStatusAction(id, "void"), "Void this invoice?")}
        >
          Void
        </Button>
      )}
    </div>
  );
}

export function SubStatusSelect({ orgId, status }: { orgId: string; status: string }) {
  const { run } = useAdminAction();
  return (
    <Select
      value={status}
      className="h-8 w-auto text-[13px]"
      onChange={(e) =>
        run("sub", () => setSubscriptionStatusAction(orgId, e.target.value as "active" | "trialing" | "past_due" | "canceled"),
          e.target.value === "canceled" ? "Cancel this subscription?" : undefined)
      }
    >
      {["trialing", "active", "past_due", "canceled"].map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </Select>
  );
}

/* ---------------- Posts ---------------- */

export function PostModerateActions({ id, archived }: { id: string; archived: boolean }) {
  const { busy, run } = useAdminAction();
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={busy === "arch"}
      onClick={() =>
        run("arch", () => adminArchivePostAction(id, !archived), archived ? undefined : "Take this post down? It moves to archived.")
      }
    >
      {archived ? "Restore" : "Take down"}
    </Button>
  );
}

/* ---------------- Connections ---------------- */

export function SocialDisconnect({ id, status }: { id: string; status: string }) {
  const { busy, run } = useAdminAction();
  if (status === "disconnected") return <span className="text-[13px] text-[var(--text-subtle)]">—</span>;
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={busy === "dc"}
      onClick={() => run("dc", () => adminDisconnectSocialAction(id), "Force-disconnect this social account?")}
    >
      Disconnect
    </Button>
  );
}

export function ApiKeyRevoke({ id }: { id: string }) {
  const { busy, run } = useAdminAction();
  return (
    <Button size="sm" variant="ghost" loading={busy === "rv"} onClick={() => run("rv", () => revokeApiKeyAction(id), "Revoke this API key?")}>
      Revoke
    </Button>
  );
}

export function WebhookToggle({ id, active }: { id: string; active: boolean }) {
  const { run } = useAdminAction();
  return <Switch checked={active} srLabel="Webhook active" onCheckedChange={(v) => run("wh", () => setWebhookActiveAction(id, v))} />;
}

/* ---------------- Publish queue ---------------- */

export function JobActions({ id, status }: { id: string; status: string }) {
  const { busy, run } = useAdminAction();
  return (
    <div className="flex flex-wrap gap-1.5">
      {(status === "failed" || status === "canceled") && (
        <Button size="sm" variant="ghost" loading={busy === "rt"} onClick={() => run("rt", () => retryPublishJobAction(id))}>
          Retry
        </Button>
      )}
      {(status === "queued" || status === "running") && (
        <Button size="sm" variant="ghost" loading={busy === "cx"} onClick={() => run("cx", () => cancelPublishJobAction(id))}>
          Cancel
        </Button>
      )}
    </div>
  );
}

/* ---------------- Broadcast composer ---------------- */

export function BroadcastForm({ planKeys }: { planKeys: string[] }) {
  const { busy, run } = useAdminAction();
  const [audience, setAudience] = React.useState<"all" | "verified" | "unverified" | "plan">("all");
  const [planKey, setPlanKey] = React.useState(planKeys[0] ?? "");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [linkUrl, setLinkUrl] = React.useState("");

  return (
    <form
      className="max-w-2xl space-y-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          "send",
          async () => {
            const res = await broadcastNotificationAction({ audience, planKey, title, body, linkUrl });
            if (res.ok) {
              setTitle("");
              setBody("");
              setLinkUrl("");
            }
            return res;
          },
          "Send this notification now? It cannot be recalled.",
        );
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Audience">
          <Select value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)}>
            <option value="all">All users</option>
            <option value="verified">Verified only</option>
            <option value="unverified">Unverified only</option>
            <option value="plan">On a specific plan</option>
          </Select>
        </Field>
        {audience === "plan" && (
          <Field label="Plan">
            <Select value={planKey} onChange={(e) => setPlanKey(e.target.value)}>
              {planKeys.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="Scheduled maintenance Sunday 02:00 UTC" />
      </Field>
      <Field label="Body">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={2000} placeholder="What users need to know…" />
      </Field>
      <Field label="Link (optional)">
        <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="/changelog or https://…" />
      </Field>
      <Button type="submit" loading={busy === "send"} disabled={!title.trim() || !body.trim()}>
        Send broadcast
      </Button>
    </form>
  );
}

/* ---------------- Coupons ---------------- */

export function NewCouponButton() {
  const { busy, run } = useAdminAction();
  const [open, setOpen] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const [kind, setKind] = React.useState<"credit" | "percent">("credit");
  const [dollars, setDollars] = React.useState(10);
  const [percent, setPercent] = React.useState(20);
  const [maxR, setMaxR] = React.useState(0);
  const [expires, setExpires] = React.useState("");

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>New coupon</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create coupon"
        description="Grants account credit when redeemed in Settings → Billing."
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              loading={busy === "coupon"}
              disabled={!code.trim() || dollars <= 0}
              onClick={() =>
                run("coupon", async () => {
                  const res = await createCouponAction({
                    code,
                    description: desc,
                    ...(kind === "credit" ? { amountOff: Math.round(dollars * 100) } : { percentOff: percent }),
                    maxRedemptions: maxR,
                    expiresAt: expires || undefined,
                  });
                  if (res.ok) { setOpen(false); setCode(""); setDesc(""); setDollars(10); setPercent(20); setMaxR(0); setExpires(""); }
                  return res;
                })
              }
            >
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Code"><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="LAUNCH25" /></Field>
          <Field label="Description"><Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Launch promo" /></Field>
          <Field label="Type">
            <Select value={kind} onChange={(e) => setKind(e.target.value as "credit" | "percent")}>
              <option value="credit">Account credit ($)</option>
              <option value="percent">Percent off each invoice</option>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            {kind === "credit" ? (
              <Field label="Credit ($)"><Input type="number" min={1} value={dollars} onChange={(e) => setDollars(Number(e.target.value))} /></Field>
            ) : (
              <Field label="Percent off"><Input type="number" min={1} max={100} value={percent} onChange={(e) => setPercent(Number(e.target.value))} /></Field>
            )}
            <Field label="Max redemptions" hint="0 = unlimited"><Input type="number" min={0} value={maxR} onChange={(e) => setMaxR(Number(e.target.value))} /></Field>
          </div>
          <Field label="Expires" hint="optional"><Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></Field>
        </div>
      </Modal>
    </>
  );
}

export function CouponRow({ id, active, redeemable }: { id: string; active: boolean; redeemable: boolean }) {
  const { busy, run } = useAdminAction();
  return (
    <div className="flex items-center gap-2">
      <Switch checked={active} srLabel="Coupon active" onCheckedChange={(v) => run("t", () => setCouponActiveAction(id, v))} />
      <Button
        size="sm"
        variant="ghost"
        disabled={!redeemable}
        loading={busy === "d"}
        onClick={() => run("d", () => deleteCouponAction(id), "Delete this coupon?")}
      >
        {redeemable ? "Delete" : "Redeemed — locked"}
      </Button>
    </div>
  );
}
