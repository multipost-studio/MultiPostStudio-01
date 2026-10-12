"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/controls";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { confirmDestructive, promptReason } from "@/components/ui/confirm";
import { PLAN_KEYS } from "@/lib/constants";
import {
  toggleFeatureFlagAction,
  setFlagRolloutAction,
  setUserAdminAction,
  setUserSuspendedAction,
  forceVerifyUserAction,
  deleteUserAction,
  setOrgSuspendedAction,
  adminSetOrgPlanAction,
  deleteOrgAction,
  updatePlanAction,
} from "@/app/actions/admin";
import { impersonateUserAction } from "@/app/actions/impersonation";

export type Res = { ok: boolean; error?: string; message?: string; redirectTo?: string };

export function useAdminAction() {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<Res>, confirmMsg?: string) => {
    if (
      confirmMsg &&
      !(await confirmDestructive({
        title: "Please confirm",
        body: confirmMsg,
        confirmLabel: "Confirm",
      }))
    )
      return;
    setBusy(key);
    const res = await fn();
    setBusy(null);
    toast({ title: res.ok ? res.message ?? "Done" : res.error ?? "Failed", tone: res.ok ? "success" : "error" });
    if (res.ok) {
      if (res.redirectTo) {
        window.location.href = res.redirectTo;
      } else {
        router.refresh();
      }
    }
  };
  /** Ask for a written reason first (recorded in the audit log), then run. Nothing happens if the person cancels. */
  const runWithReason = async (key: string, fn: (reason: string) => Promise<Res>, body: string | undefined, title = "Please confirm") => {
    const reason = await promptReason({ title, body: body ?? "Confirm this change. Your reason is saved in the audit log.", confirmLabel: "Confirm" });
    if (reason) await run(key, () => fn(reason));
  };
  return { busy, run, runWithReason };
}

export function UserRowActions({
  userId,
  suspended,
  verified,
  isPlatformAdmin,
}: {
  userId: string;
  suspended: boolean;
  verified: boolean;
  isPlatformAdmin?: boolean;
}) {
  const { busy, run, runWithReason } = useAdminAction();
  return (
    <div className="flex flex-wrap gap-1.5">
      {!isPlatformAdmin && !suspended && (
        <Button
          size="sm"
          variant="outline"
          loading={busy === "imp"}
          onClick={() =>
            run(
              "imp",
              () => impersonateUserAction(userId),
              "View this user read-only? You will see the application as they do and cannot change anything. Open their profile to start an edit session."
            )
          }
        >
          View as
        </Button>
      )}
      <Button
        size="sm"
        variant={suspended ? "secondary" : "ghost"}
        loading={busy === "sus"}
        onClick={() => runWithReason("sus", (r) => setUserSuspendedAction(userId, !suspended, r), "Confirm this change. Your reason is saved in the audit log.")}
      >
        {suspended ? "Restore" : "Suspend"}
      </Button>
      {!verified && (
        <Button size="sm" variant="ghost" loading={busy === "ver"} onClick={() => runWithReason("ver", (r) => forceVerifyUserAction(userId, r), "Confirm this change. Your reason is saved in the audit log.")}>
          Verify
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        loading={busy === "del"}
        onClick={() => runWithReason("del", (r) => deleteUserAction(userId, r), "Soft-delete this user? They can no longer sign in.")}
      >
        Delete
      </Button>
    </div>
  );
}

export function OrgRowActions({ orgId, planKey }: { orgId: string; planKey: string }) {
  const { busy, run, runWithReason } = useAdminAction();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Select
        aria-label="Plan"
        value={planKey}
        size="sm"
        className="w-auto"
        onChange={async (e) => {
          const plan = e.target.value;
          const reason = await promptReason({ title: "Override plan", body: `Move this organization to the ${plan} plan (monthly)? Quotas change immediately.`, confirmLabel: "Apply plan" });
          if (reason) await run("plan", () => adminSetOrgPlanAction(orgId, plan, "month", reason));
        }}
      >
        {PLAN_KEYS.map((k) => (
          <option key={k} value={k}>{k}</option>
        ))}
      </Select>
      <Button
        size="sm"
        variant="ghost"
        loading={busy === "del"}
        onClick={() => runWithReason("del", (r) => deleteOrgAction(orgId, r), "Soft-delete this organization?")}
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
          const reason = await promptReason({ title: v ? "Turn flag on" : "Turn flag off", body: `${v ? "Enable" : "Disable"} this feature flag for everyone? It takes effect within about 30 seconds.`, confirmLabel: v ? "Turn on" : "Turn off" });
          if (!reason) return;
          await toggleFeatureFlagAction(id, v, reason);
          router.refresh();
        }}
        srLabel="Flag enabled"
      />
      <Input
        type="number"
        aria-label="Rollout percentage"
        value={r}
        min={0}
        max={100}
        onChange={(e) => setR(Number(e.target.value))}
        onBlur={async () => {
          if (r === rollout) return;
          const reason = await promptReason({ title: "Change rollout", body: `Set this flag's rollout to ${r}%?`, confirmLabel: "Change rollout" });
          if (!reason) {
            setR(rollout);
            return;
          }
          await setFlagRolloutAction(id, r, reason);
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
        const reason = await promptReason({ title: "Change admin access", body: v ? "Make this person a platform admin with full access?" : "Remove this person's platform admin access?", confirmLabel: "Confirm" });
        if (!reason) return;
        const res = await setUserAdminAction(userId, v, reason);
        if (!res.ok) toast({ title: res.error ?? "Failed", tone: "error" });
        router.refresh();
      }}
      srLabel="Platform admin"
    />
  );
}

export function OrgSuspend({ orgId, suspended }: { orgId: string; suspended: boolean }) {
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant={suspended ? "secondary" : "ghost"}
      onClick={async () => {
        const reason = await promptReason({ title: suspended ? "Restore organization" : "Suspend organization", body: suspended ? "Let this organization's members sign in again?" : "Suspend this organization? Its members lose access until it is restored.", confirmLabel: suspended ? "Restore" : "Suspend" });
        if (!reason) return;
        await setOrgSuspendedAction(orgId, !suspended, reason);
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
          const reason = await promptReason({ title: "Save plan changes", body: "Limits, entitlements and prices apply to every customer on this plan straight away. Existing gateway subscriptions keep what they already charge.", confirmLabel: "Save plan" });
          if (!reason) return;
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
          }, reason);
          setSaving(false);
          toast({ title: res.ok ? (res.message ?? "Saved") : (res.error ?? "Failed"), tone: res.ok ? "success" : "error" });
          router.refresh();
        }}
      >
        Save plan
      </Button>
    </div>
  );
}
