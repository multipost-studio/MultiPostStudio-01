"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Switch } from "@/components/ui/controls";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { ENTITLEMENT_GROUPS } from "@/lib/constants";
import { useAdminAction } from "../admin-client";
import {
  updatePlanAction,
  createPlanAction,
  deletePlanAction,
  seedDefaultPlansAction,
  type PlanPatch,
} from "@/app/actions/admin";

export type AdminPlan = {
  id: string;
  key: string;
  name: string;
  badge: string | null;
  currency: string;
  priceMonthly: number;
  priceAnnual: number;
  annualDiscountPct: number;
  trialDays: number;
  maxChannels: number;
  maxUsers: number;
  maxScheduled: number;
  aiCredits: number;
  storageMb: number;
  analyticsRetentionDays: number;
  apiRateLimit: number;
  automationLimit: number;
  features: string[];
  entitlements: string[];
  isPublic: boolean;
  isCustom: boolean;
  sortIndex: number;
  subscriberCount: number;
};

const NUM_FIELDS: { key: keyof AdminPlan; label: string; hint?: string }[] = [
  { key: "priceMonthly", label: "Monthly price", hint: "minor units (cents)" },
  { key: "priceAnnual", label: "Annual price", hint: "minor units (cents)" },
  { key: "annualDiscountPct", label: "Annual discount %" },
  { key: "trialDays", label: "Trial days" },
  { key: "maxChannels", label: "Channel limit" },
  { key: "maxUsers", label: "Member limit" },
  { key: "maxScheduled", label: "Scheduled-post limit" },
  { key: "aiCredits", label: "AI credits / mo" },
  { key: "storageMb", label: "Storage (MB)" },
  { key: "analyticsRetentionDays", label: "Analytics retention (days)" },
  { key: "apiRateLimit", label: "API rate limit (req/min)" },
  { key: "automationLimit", label: "Automation limit" },
];

export function SeedPlansButton({ variant = "primary" }: { variant?: "primary" | "secondary" }) {
  const { busy, run } = useAdminAction();
  return (
    <Button
      variant={variant}
      loading={busy === "seed"}
      onClick={() => run("seed", () => seedDefaultPlansAction(), "Write the 5 built-in plans (Free / Pro / Team / Agency / Enterprise) into the database? Existing plans with the same key are updated in place.")}
    >
      Seed default plans
    </Button>
  );
}

export function NewPlanButton() {
  const { busy, run } = useAdminAction();
  const [open, setOpen] = React.useState(false);
  const [key, setKey] = React.useState("");
  const [name, setName] = React.useState("");
  const [priceMonthly, setPriceMonthly] = React.useState(0);

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>New plan</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create plan"
        description="A custom plan. Set limits and entitlements after it's created."
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              loading={busy === "create"}
              disabled={!key.trim() || !name.trim()}
              onClick={() =>
                run("create", async () => {
                  const res = await createPlanAction({ key, name, priceMonthly, currency: "usd" });
                  if (res.ok) { setOpen(false); setKey(""); setName(""); setPriceMonthly(0); }
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
          <Field label="Key" hint="lowercase, url-safe — e.g. custom-acme">
            <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="custom-acme" />
          </Field>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Custom" />
          </Field>
          <Field label="Monthly price" hint="minor units (cents)">
            <Input type="number" value={priceMonthly} onChange={(e) => setPriceMonthly(Number(e.target.value))} />
          </Field>
        </div>
      </Modal>
    </>
  );
}

export function PlanEditorPro({ plan }: { plan: AdminPlan }) {
  const { busy, run } = useAdminAction();
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState(plan);
  const ent = React.useMemo(() => new Set(v.entitlements), [v.entitlements]);

  const setNum = (k: keyof AdminPlan, n: number) => setV((s) => ({ ...s, [k]: n }));
  const toggleEnt = (k: string) =>
    setV((s) => {
      const next = new Set(s.entitlements);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return { ...s, entitlements: [...next] };
    });

  const save = () =>
    run("save", () => {
      const patch: PlanPatch = {
        name: v.name,
        badge: v.badge,
        currency: v.currency,
        priceMonthly: v.priceMonthly,
        priceAnnual: v.priceAnnual,
        annualDiscountPct: v.annualDiscountPct,
        trialDays: v.trialDays,
        maxChannels: v.maxChannels,
        maxUsers: v.maxUsers,
        maxScheduled: v.maxScheduled,
        aiCredits: v.aiCredits,
        storageMb: v.storageMb,
        analyticsRetentionDays: v.analyticsRetentionDays,
        apiRateLimit: v.apiRateLimit,
        automationLimit: v.automationLimit,
        features: v.features,
        entitlements: v.entitlements,
        isPublic: v.isPublic,
        isCustom: v.isCustom,
        sortIndex: v.sortIndex,
      };
      return updatePlanAction(plan.id, patch);
    });

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="font-semibold text-[var(--text)]">{v.name}</span>
          <span className="font-mono text-[12px] text-[var(--text-subtle)]">{v.key}</span>
          {v.badge && <Badge tone="success">{v.badge}</Badge>}
          {!v.isPublic && <Badge tone="neutral">hidden</Badge>}
          {v.isCustom && <Badge tone="warning">custom</Badge>}
        </span>
        <span className="flex items-center gap-3 text-[13px] text-[var(--text-muted)]">
          <span>
            {v.currency.toUpperCase()} {(v.priceMonthly / 100).toFixed(0)}/mo
          </span>
          <span className="tabular-nums">{plan.subscriberCount} subs</span>
          <span className="text-[var(--text-subtle)]">{ent.size} entitlements</span>
          <span>{open ? "▲" : "▼"}</span>
        </span>
      </button>

      {open && (
        <div className="space-y-5 border-t border-[var(--border)] p-4">
          {/* identity */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Name"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
            <Field label="Badge" hint="blank = none">
              <Input value={v.badge ?? ""} onChange={(e) => setV({ ...v, badge: e.target.value || null })} placeholder="Most popular" />
            </Field>
            <Field label="Currency"><Input value={v.currency} onChange={(e) => setV({ ...v, currency: e.target.value })} /></Field>
          </div>

          {/* numeric limits + pricing */}
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {NUM_FIELDS.map((f) => (
              <Field key={f.key as string} label={f.label} hint={f.hint}>
                <Input
                  type="number"
                  value={v[f.key] as number}
                  onChange={(e) => setNum(f.key, Number(e.target.value))}
                />
              </Field>
            ))}
          </div>

          <div className="flex flex-wrap gap-6">
            <Switch checked={v.isPublic} onCheckedChange={(x) => setV({ ...v, isPublic: x })} label="Listed on /pricing" />
            <Switch checked={v.isCustom} onCheckedChange={(x) => setV({ ...v, isCustom: x })} label="Custom / negotiated plan" />
          </div>

          <Field label="Marketing bullets" hint="comma-separated">
            <Textarea
              rows={2}
              value={v.features.join(", ")}
              onChange={(e) => setV({ ...v, features: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
            />
          </Field>

          {/* entitlements */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] font-semibold text-[var(--text)]">Feature entitlements</p>
              <span className="text-[12px] text-[var(--text-subtle)]">{ent.size} enabled</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ENTITLEMENT_GROUPS.map((g) => (
                <div key={g.group} className="rounded-[var(--radius-md)] border border-[var(--border)] p-3">
                  <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[var(--text-subtle)]">{g.group}</p>
                  <ul className="space-y-1.5">
                    {g.items.map(([k, label]) => (
                      <li key={k} className="flex items-center justify-between gap-2">
                        <span className="text-[13px] text-[var(--text-muted)]">{label}</span>
                        <Switch checked={ent.has(k)} onCheckedChange={() => toggleEnt(k)} srLabel={label} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-[var(--border)] pt-3">
            <DeletePlanButton id={plan.id} name={plan.name} disabled={plan.subscriberCount > 0} />
            <Button size="sm" loading={busy === "save"} onClick={save}>Save plan</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function DeletePlanButton({ id, name, disabled }: { id: string; name: string; disabled: boolean }) {
  const { busy, run } = useAdminAction();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={disabled}
      loading={busy === "del"}
      onClick={() => run("del", () => deletePlanAction(id), `Delete the "${name}" plan?`)}
    >
      {disabled ? "In use — can't delete" : "Delete plan"}
    </Button>
  );
}
