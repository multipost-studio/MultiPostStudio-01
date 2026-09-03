"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/controls";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  toggleFeatureFlagAction,
  setFlagRolloutAction,
  setUserAdminAction,
  updateTicketStatusAction,
  setOrgSuspendedAction,
  updatePlanAction,
} from "@/app/actions/admin";

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

export function PlanEditor({
  id,
  priceMonthly,
  maxChannels,
  maxUsers,
  aiCredits,
}: {
  id: string;
  priceMonthly: number;
  maxChannels: number;
  maxUsers: number;
  aiCredits: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [v, setV] = React.useState({ priceMonthly, maxChannels, maxUsers, aiCredits });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(["priceMonthly", "maxChannels", "maxUsers", "aiCredits"] as const).map((k) => (
        <label key={k} className="text-[12px] text-[var(--text-subtle)]">
          {k}
          <Input
            type="number"
            value={v[k]}
            onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })}
            className="h-8 w-24"
          />
        </label>
      ))}
      <Button
        size="sm"
        variant="secondary"
        onClick={async () => {
          const res = await updatePlanAction(id, v);
          toast({ title: res.message ?? "Saved", tone: "success" });
          router.refresh();
        }}
      >
        Save
      </Button>
    </div>
  );
}
