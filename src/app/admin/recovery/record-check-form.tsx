"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { recordBackupCheckAction } from "@/app/actions/admin-recovery";
import { CHECK_KINDS, CHECK_RESULTS } from "@/lib/recovery-status";
import { MIN_DATE } from "@/lib/date-range";

export function RecordCheckForm({ today }: { today: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [kind, setKind] = React.useState("backup");
  const [result, setResult] = React.useState("ok");
  const [day, setDay] = React.useState(today);
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const needsNotes = result === "failed" && !notes.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || needsNotes) return;
    setBusy(true);
    try {
      const res = await recordBackupCheckAction({ kind, result, occurredOn: day, notes: notes.trim() || undefined });
      toast({ title: res.ok ? res.message : res.error, tone: res.ok ? "success" : "error" });
      if (res.ok) {
        setNotes("");
        router.refresh();
      }
    } catch {
      toast({ title: "Couldn't record that. Try again.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 md:grid-cols-4">
      <div className="md:col-span-4">
        <h2 className="text-[15px] font-semibold text-[var(--text)]">Record a check</h2>
        <p className="text-[13px] text-[var(--text-muted)]">Entries can&apos;t be edited or deleted. If one is wrong, record a correcting one.</p>
      </div>
      <div>
        <Label htmlFor="bk-kind">What</Label>
        <Select id="bk-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          {CHECK_KINDS.map((k) => (
            <option key={k.id} value={k.id}>{k.label}</option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="bk-result">Result</Label>
        <Select id="bk-result" value={result} onChange={(e) => setResult(e.target.value)}>
          {CHECK_RESULTS.map((r) => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="bk-day">Date it happened</Label>
        <Input id="bk-day" type="date" value={day} min={MIN_DATE} max={today} onChange={(e) => setDay(e.target.value)} />
      </div>
      <div className="md:col-span-4">
        <Label htmlFor="bk-notes">{result === "failed" ? "What went wrong (required)" : "Notes (optional)"}</Label>
        <Textarea id="bk-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="Where you checked, the backup's timestamp or size, how long the restore took…" />
      </div>
      <div className="md:col-span-4">
        <Button type="submit" disabled={busy || !day || needsNotes}>Record</Button>
      </div>
    </form>
  );
}
