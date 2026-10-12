"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { promptReason } from "@/components/ui/confirm";
import { createKillSwitchAction, revokeKillSwitchAction } from "@/app/actions/admin-kill-switches";

type Opt = { id: string; label: string };

export function CreateSwitch({ aiProviders, platforms, kinds, scopes }: { aiProviders: string[]; platforms: Opt[]; kinds: Opt[]; scopes: Opt[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [kind, setKind] = React.useState("publishing");
  const [scopeType, setScopeType] = React.useState("platform");
  const [value, setValue] = React.useState("");
  const [hours, setHours] = React.useState("24");
  const [busy, setBusy] = React.useState(false);
  const providerOptions: Opt[] = kind === "ai" ? aiProviders.map((p) => ({ id: p, label: p })) : platforms;
  const needsValue = scopeType !== "platform";
  const valid = (!needsValue || value.trim() !== "") && (hours === "" || (Number.isInteger(Number(hours)) && Number(hours) >= 1));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    const scopeText = scopeType === "platform" ? "everyone" : scopeType === "org" ? `organization ${value}` : value;
    const reason = await promptReason({
      title: "Pause",
      body: `Pause ${kind === "ai" ? "AI features" : "publishing"} for ${scopeText}${hours ? ` for ${hours} hour(s)` : " until you lift it"}? Customers see a generic notice, not your reason.`,
      confirmLabel: "Pause",
    });
    if (!reason) return;
    setBusy(true);
    try {
      const res = await createKillSwitchAction({ kind, scopeType, scopeValue: needsValue ? value.trim() : null, expiresInHours: hours === "" ? null : Number(hours) }, reason);
      toast({ title: res.ok ? res.message : res.error, tone: res.ok ? "success" : "error" });
      if (res.ok) {
        setValue("");
        router.refresh();
      }
    } catch {
      toast({ title: "Couldn't create the pause. Try again.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 md:grid-cols-4">
      <div className="md:col-span-4">
        <h2 className="text-[15px] font-semibold text-[var(--text)]">Pause something</h2>
      </div>
      <div>
        <Label htmlFor="ks-kind">What</Label>
        <Select id="ks-kind" value={kind} onChange={(e) => { setKind(e.target.value); setValue(""); }}>
          {kinds.map((k) => (
            <option key={k.id} value={k.id}>{k.label}</option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="ks-scope">For</Label>
        <Select id="ks-scope" value={scopeType} onChange={(e) => { setScopeType(e.target.value); setValue(""); }}>
          {scopes.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </Select>
      </div>
      <div>
        {scopeType === "org" && (
          <>
            <Label htmlFor="ks-org">Organization id or slug</Label>
            <Input id="ks-org" value={value} onChange={(e) => setValue(e.target.value)} placeholder="acme-inc" />
          </>
        )}
        {scopeType === "provider" && (
          <>
            <Label htmlFor="ks-provider">{kind === "ai" ? "AI provider" : "Platform"}</Label>
            <Select id="ks-provider" value={value} onChange={(e) => setValue(e.target.value)}>
              <option value="">Choose…</option>
              {providerOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </Select>
          </>
        )}
      </div>
      <div>
        <Label htmlFor="ks-hours">Ends after (hours)</Label>
        <Input id="ks-hours" inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value.replace(/\D/g, ""))} placeholder="no end" />
      </div>
      <div className="md:col-span-4">
        <Button type="submit" variant="danger" disabled={!valid || busy}>Pause…</Button>
      </div>
    </form>
  );
}

export function LiftButton({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  async function lift() {
    const reason = await promptReason({ title: "Lift pause", body: "End this pause now? Held work resumes within a few minutes.", confirmLabel: "Lift pause" });
    if (!reason) return;
    setBusy(true);
    try {
      const res = await revokeKillSwitchAction(id, reason);
      toast({ title: res.ok ? res.message : res.error, tone: res.ok ? "success" : "error" });
      if (res.ok) router.refresh();
    } catch {
      toast({ title: "Couldn't lift the pause. Try again.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button size="sm" variant="secondary" loading={busy} onClick={lift}>
      Lift pause
    </Button>
  );
}
