"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/controls";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { PLAN_KEYS } from "@/lib/constants";
import {
  toggleFeatureFlagAction,
  setFlagRolloutAction,
  setUserAdminAction,
  setUserSuspendedAction,
  forceVerifyUserAction,
  deleteUserAction,
  updateTicketStatusAction,
  setOrgSuspendedAction,
  adminSetOrgPlanAction,
  deleteOrgAction,
  updatePlanAction,
} from "@/app/actions/admin";

export type Res = { ok: boolean; error?: string; message?: string };

export function useAdminAction() {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<Res>, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(key);
    const res = await fn();
    setBusy(null);
    toast({ title: res.ok ? res.message ?? "Done" : res.error ?? "Failed", tone: res.ok ? "success" : "error" });
    if (res.ok) router.refresh();
  };
  return { busy, run };
}

export function UserRowActions({
  userId,
  suspended,
  verified,
}: {
  userId: string;
  suspended: boolean;
  verified: boolean;
}) {
  const { busy, run } = useAdminAction();
  return (
    <div className="flex flex-wrap gap-1.5">
      <Button
        size="sm"
        variant={suspended ? "secondary" : "ghost"}
        loading={busy === "sus"}
        onClick={() => run("sus", () => setUserSuspendedAction(userId, !suspended))}
      >
        {suspended ? "Restore" : "Suspend"}
      </Button>
      {!verified && (
        <Button size="sm" variant="ghost" loading={busy === "ver"} onClick={() => run("ver", () => forceVerifyUserAction(userId))}>
          Verify
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        loading={busy === "del"}
        onClick={() => run("del", () => deleteUserAction(userId), "Soft-delete this user? They can no longer sign in.")}
      >
        Delete
      </Button>
    </div>
  );
}

export function OrgRowActions({ orgId, planKey }: { orgId: string; planKey: string }) {
  const { busy, run } = useAdminAction();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Select
        value={planKey}
        className="h-8 w-auto text-[13px]"
        onChange={(e) => run("plan", () => adminSetOrgPlanAction(orgId, e.target.value, "month"))}
      >
        {PLAN_KEYS.map((k) => (
          <option key={k} value={k}>{k}</option>
        ))}
      </Select>
      <Button
        size="sm"
        variant="ghost"
        loading={busy === "del"}
        onClick={() => run("del", () => deleteOrgAction(orgId), "Soft-delete this organization?")}
      >
        Delete
      </Button>
    </div>
  );
}

export function FlagToggle({ id, enabled, rollout }: { id: string; enabled: boolean; rollout: number }) {
  const router = useRouter();
  const [r, setR] = React.useState(rollout);
  return (
    <div className="flex items-center gap-3">
      <Switch
        checked={enabled}
        onCheckedChange={async (v) => {
          await toggleFeatureFlagAction(id, v);
          router.refresh();
        }}
      />
      <Input
        type="number"
        value={r}
        min={0}
        max={100}
        onChange={(e) => setR(Number(e.target.value))}
        onBlur={async () => {
          await setFlagRolloutAction(id, r);
          router.refresh();
        }}
        className="h-8 w-20"
      />
      <span className="text-[12px] text-[var(--text-subtle)]">% rollout</span>
    </div>
  );
}

export function UserAdminToggle({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  return (
    <Switch
      checked={isAdmin}
      onCheckedChange={async (v) => {
        const res = await setUserAdminAction(userId, v);
        if (!res.ok) toast({ title: res.error ?? "Failed", tone: "error" });
        router.refresh();
      }}
      srLabel="Platform admin"
    />
  );
}

export function TicketStatus({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  return (
    <Select
      value={status}
      onChange={async (e) => {
        await updateTicketStatusAction(id, e.target.value as "open");
        router.refresh();
      }}
      className="h-8 w-auto text-[13px]"
    >
      {["open", "pending", "resolved", "closed"].map((s) => (
        <option key={s}>{s}</option>
      ))}
    </Select>
  );
}

export function OrgSuspend({ orgId, suspended }: { orgId: string; suspended: boolean }) {
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant={suspended ? "secondary" : "ghost"}
      onClick={async () => {
        await setOrgSuspendedAction(orgId, !suspended);
        router.refresh();
      }}
    >
      {suspended ? "Restore" : "Suspend"}
    </Button>
  );
}

type PlanFields = {
  name: string;
  priceMonthly: number;
  priceAnnual: number;
  maxChannels: number;
  maxUsers: number;
  maxScheduled: number;
  aiCredits: number;
  storageMb: number;
  features: string;
};

export function PlanEditor(props: {
  id: string;
  name: string;
  priceMonthly: number;
  priceAnnual: number;
  maxChannels: number;
  maxUsers: number;
  maxScheduled: number;
  aiCredits: number;
  storageMb: number;
  features: string[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [v, setV] = React.useState<PlanFields>({
    name: props.name,
    priceMonthly: props.priceMonthly,
    priceAnnual: props.priceAnnual,
    maxChannels: props.maxChannels,
    maxUsers: props.maxUsers,
    maxScheduled: props.maxScheduled,
    aiCredits: props.aiCredits,
    storageMb: props.storageMb,
    features: props.features.join(", "),
  });
  const [saving, setSaving] = React.useState(false);

  const numFields: (keyof PlanFields)[] = [
    "priceMonthly",
    "priceAnnual",
    "maxChannels",
    "maxUsers",
    "maxScheduled",
    "aiCredits",
    "storageMb",
  ];

  return (
    <div className="space-y-2">
      <label className="block text-[12px] text-[var(--text-subtle)]">
        name
        <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className="h-8" />
      </label>
      <div className="flex flex-wrap gap-2">
        {numFields.map((k) => (
          <label key={k} className="text-[12px] text-[var(--text-subtle)]">
            {k}
            <Input
              type="number"
              value={v[k] as number}
              onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })}
              className="h-8 w-28"
            />
          </label>
        ))}
      </div>
      <label className="block text-[12px] text-[var(--text-subtle)]">
        features (comma-separated)
        <Input value={v.features} onChange={(e) => setV({ ...v, features: e.target.value })} className="h-8" />
      </label>
      <Button
        size="sm"
        variant="secondary"
        loading={saving}
        onClick={async () => {
          setSaving(true);
          const res = await updatePlanAction(props.id, {
            name: v.name,
            priceMonthly: v.priceMonthly,
            priceAnnual: v.priceAnnual,
            maxChannels: v.maxChannels,
            maxUsers: v.maxUsers,
            maxScheduled: v.maxScheduled,
            aiCredits: v.aiCredits,
            storageMb: v.storageMb,
            features: v.features.split(",").map((f) => f.trim()).filter(Boolean),
          });
          setSaving(false);
          toast({ title: res.message ?? "Saved", tone: res.ok ? "success" : "error" });
          router.refresh();
        }}
      >
        Save plan
      </Button>
    </div>
  );
}
