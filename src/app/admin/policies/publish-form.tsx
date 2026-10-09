"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { publishPolicyVersionAction } from "@/app/actions/admin-policies";
import { POLICY_TYPES, SUMMARY_MAX, TITLE_MAX, VERSION_RE } from "@/lib/policy-versions";

export function PublishPolicyForm({ today }: { today: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [type, setType] = React.useState("terms");
  const [version, setVersion] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [effectiveOn, setEffectiveOn] = React.useState(today);
  const [busy, setBusy] = React.useState(false);
  const valid = VERSION_RE.test(version.trim()) && title.trim().length >= 3 && summary.trim().length >= 8 && !!effectiveOn;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      const res = await publishPolicyVersionAction({ type, version, title, url: url || undefined, summary, effectiveOn });
      toast({ title: res.ok ? res.message : res.error, tone: res.ok ? "success" : "error" });
      if (res.ok) {
        setVersion("");
        setTitle("");
        setUrl("");
        setSummary("");
        router.refresh();
      }
    } catch {
      toast({ title: "Couldn't publish. Try again.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 md:grid-cols-3">
      <div className="md:col-span-3">
        <h2 className="text-[15px] font-semibold text-[var(--text)]">Publish a new version</h2>
        <p className="text-[13px] text-[var(--text-muted)]">Published versions can&apos;t be edited or deleted. Fix a mistake with a new version number.</p>
      </div>
      <div>
        <Label htmlFor="pol-type">Document</Label>
        <Select id="pol-type" value={type} onChange={(e) => setType(e.target.value)}>
          {POLICY_TYPES.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="pol-version">Version</Label>
        <Input id="pol-version" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="e.g. 2.1 or 2026-10" maxLength={20} />
      </div>
      <div>
        <Label htmlFor="pol-date">Effective from</Label>
        <Input id="pol-date" type="date" value={effectiveOn} onChange={(e) => setEffectiveOn(e.target.value)} />
      </div>
      <div className="md:col-span-2">
        <Label htmlFor="pol-title">Title</Label>
        <Input id="pol-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TITLE_MAX} />
      </div>
      <div>
        <Label htmlFor="pol-url">Link (optional)</Label>
        <Input id="pol-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/terms or https://…" />
      </div>
      <div className="md:col-span-3">
        <Label htmlFor="pol-summary">What changed</Label>
        <Textarea id="pol-summary" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={SUMMARY_MAX} />
      </div>
      <div className="md:col-span-3">
        <Button type="submit" disabled={!valid || busy}>Publish version</Button>
      </div>
    </form>
  );
}
