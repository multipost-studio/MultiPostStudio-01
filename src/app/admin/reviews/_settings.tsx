"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Plus, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { importReviewConfigAction, resetReviewConfigAction, saveReviewConfigAction } from "@/app/actions/admin-reviews";
import { MAX_EXTERNAL_LINKS, MAX_IMPORT_BYTES, newLinkId, parseReviewConfig, type ReviewConfig } from "@/lib/reviews/config";
import { Panel } from "../branding/_ui";
import { download } from "./_import";

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 max-w-md">
        <p className="text-[14.5px] font-semibold text-[var(--text)]">{label}</p>
        {hint && <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Num({ value, onChange, min, max, unit }: { value: number; onChange: (n: number) => void; min: number; max: number; unit: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Input type="number" value={value} min={min} max={max} onChange={(e) => onChange(Math.round(Number(e.target.value) || 0))} className="w-24" aria-label={unit} />
      <span className="w-14 text-[13px] text-[var(--text-muted)]">{unit}</span>
    </span>
  );
}

export function SettingsTab({ initial }: { initial: ReviewConfig }) {
  const router = useRouter();
  const { toast } = useToast();
  const [saved, setSaved] = React.useState(initial);
  const [draft, setDraft] = React.useState(initial);
  const [busy, setBusy] = React.useState<null | "save" | "import" | "reset">(null);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const check = parseReviewConfig(draft);
  const problem = errors[0] ?? (!check.ok ? check.errors[0] : null);

  const setPrompt = <K extends keyof ReviewConfig["prompt"]>(k: K, v: ReviewConfig["prompt"][K]) => setDraft((d) => ({ ...d, prompt: { ...d.prompt, [k]: v } }));
  const setDisplay = <K extends keyof ReviewConfig["display"]>(k: K, v: ReviewConfig["display"][K]) => setDraft((d) => ({ ...d, display: { ...d.display, [k]: v } }));

  function adopt(c: ReviewConfig) {
    setSaved(c);
    setDraft(c);
    setErrors([]);
    router.refresh();
  }

  async function save() {
    setBusy("save");
    setErrors([]);
    const res = await saveReviewConfigAction(draft);
    setBusy(null);
    if (res.ok) {
      adopt(res.config);
      toast({ title: res.message, description: "The public site and the popup pick it up within a minute.", tone: "success" });
    } else setErrors(res.errors);
  }

  async function importFile(file: File) {
    setErrors([]);
    if (file.size > MAX_IMPORT_BYTES) return setErrors([`The file is larger than ${MAX_IMPORT_BYTES / 1000} KB.`]);
    setBusy("import");
    const res = await importReviewConfigAction(await file.text());
    setBusy(null);
    if (fileRef.current) fileRef.current.value = "";
    if (res.ok) {
      adopt(res.config);
      toast({ title: res.message, tone: "success" });
    } else setErrors(res.errors);
  }

  async function reset() {
    setBusy("reset");
    const res = await resetReviewConfigAction();
    setBusy(null);
    setConfirmReset(false);
    if (res.ok) {
      adopt(res.config);
      toast({ title: res.message, tone: "success" });
    } else toast({ title: "Couldn't reset", description: res.errors[0], tone: "error" });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[14px] text-[var(--text-muted)]">Control when customers are asked for a review, how new reviews are handled, and what the public site shows.</p>
        <Button onClick={() => void save()} loading={busy === "save"} disabled={!dirty || !check.ok}>
          <Save size={15} aria-hidden /> Save settings
        </Button>
      </div>
      {problem && (
        <p role="alert" className="rounded-[var(--radius-md)] border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-[13.5px] text-[var(--danger)]">
          {problem}
        </p>
      )}

      <Panel title="Review popup" description="A polite, once-per-session prompt inside the app. Closing it counts as “later”, and “Don't ask again” is always offered.">
        <div className="divide-y divide-[var(--border)]">
          <Row label="Ask customers for a review" hint="Turn the popup off entirely. The account menu still lets anyone write one.">
            <Switch checked={draft.prompt.enabled} onCheckedChange={(v) => setPrompt("enabled", v)} srLabel="Ask customers for a review" />
          </Row>
          <Row label="Account age" hint="Don't ask brand-new accounts.">
            <Num value={draft.prompt.minAccountDays} onChange={(n) => setPrompt("minAccountDays", n)} min={0} max={365} unit="days" />
          </Row>
          <Row label="Published posts" hint="Ask only people who have actually published something.">
            <Num value={draft.prompt.minPublishedPosts} onChange={(n) => setPrompt("minPublishedPosts", n)} min={0} max={1000} unit="posts" />
          </Row>
          <Row label="After “Maybe later”" hint="How long to stay quiet.">
            <Num value={draft.prompt.snoozeDays} onChange={(n) => setPrompt("snoozeDays", n)} min={1} max={365} unit="days" />
          </Row>
          <Row label="Stop after" hint="Maximum number of times the popup opens for one person.">
            <Num value={draft.prompt.maxAsks} onChange={(n) => setPrompt("maxAsks", n)} min={1} max={10} unit="times" />
          </Row>
          <Row label="Delay" hint="Seconds after a page opens before the popup appears.">
            <Num value={draft.prompt.delaySeconds} onChange={(n) => setPrompt("delaySeconds", n)} min={3} max={300} unit="seconds" />
          </Row>
          <Row label="Who is asked">
            <Select value={draft.prompt.audience} onChange={(e) => setPrompt("audience", e.target.value as "all" | "paid")} className="w-44" aria-label="Who is asked">
              <option value="all">Everyone</option>
              <option value="paid">Paying customers only</option>
            </Select>
          </Row>
        </div>
      </Panel>

      <Panel title="Publishing" description="Reviews are shown only when approved here, and only when the author agreed to publish. Hide spam and abuse, not criticism: choosing which genuine reviews to show is review-gating, which advertising and consumer rules in many regions forbid.">
        <div className="divide-y divide-[var(--border)]">
          <Row label="Reviews band on the landing page" hint="Appears only when there is at least one published review.">
            <Switch checked={draft.display.landing} onCheckedChange={(v) => setDisplay("landing", v)} srLabel="Show reviews on the landing page" />
          </Row>
          <Row label="Reviews shown in the band">
            <Num value={draft.display.landingCount} onChange={(n) => setDisplay("landingCount", n)} min={3} max={24} unit="reviews" />
          </Row>
          <Row label="Public /reviews page" hint="Lists every published review and adds rating data for search engines.">
            <Switch checked={draft.display.page} onCheckedChange={(v) => setDisplay("page", v)} srLabel="Publish the reviews page" />
          </Row>
          <Row label="Publish new reviews automatically" hint="Skips the queue for reviews whose author agreed to publish. Off is safer: you check for spam first.">
            <Switch checked={draft.display.autoApprove} onCheckedChange={(v) => setDisplay("autoApprove", v)} srLabel="Publish new reviews automatically" />
          </Row>
        </div>
      </Panel>

      <Panel title="Thank-you message" description="Shown right after someone sends a review.">
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
          <Field label="Title">
            <Input value={draft.thanks.title} maxLength={80} onChange={(e) => setDraft((d) => ({ ...d, thanks: { ...d.thanks, title: e.target.value } }))} />
          </Field>
          <Field label="Message">
            <Input value={draft.thanks.body} maxLength={300} onChange={(e) => setDraft((d) => ({ ...d, thanks: { ...d.thanks, body: e.target.value } }))} />
          </Field>
        </div>
      </Panel>

      <Panel title="Other review sites" description="After someone chooses to publish a review here, invite them to share it on G2, Capterra, Google or Product Hunt. Add your profile links.">
        <div className="space-y-2">
          {draft.externalLinks.map((l, i) => (
            <div key={l.id} className="grid gap-2 sm:grid-cols-[180px_1fr_auto]">
              <Input
                value={l.label}
                maxLength={40}
                placeholder="G2"
                aria-label="Site name"
                onChange={(e) => setDraft((d) => ({ ...d, externalLinks: d.externalLinks.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) }))}
              />
              <Input
                value={l.url}
                placeholder="https://www.g2.com/products/…/reviews"
                aria-label="Review page address"
                onChange={(e) => setDraft((d) => ({ ...d, externalLinks: d.externalLinks.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) }))}
              />
              <Button variant="ghost" size="sm" aria-label={`Remove ${l.label || "link"}`} onClick={() => setDraft((d) => ({ ...d, externalLinks: d.externalLinks.filter((_, j) => j !== i) }))}>
                <Trash2 size={14} aria-hidden />
              </Button>
            </div>
          ))}
          <Button variant="secondary" size="sm" disabled={draft.externalLinks.length >= MAX_EXTERNAL_LINKS} onClick={() => setDraft((d) => ({ ...d, externalLinks: [...d.externalLinks, { id: newLinkId(), label: "", url: "" }] }))}>
            <Plus size={13} aria-hidden /> Add a site
          </Button>
        </div>
      </Panel>

      <Panel title="Backup" description="Export these settings, bring them into another environment, or go back to the defaults.">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => download("review-settings.json", "application/json", JSON.stringify({ exportedAt: new Date().toISOString(), config: saved }, null, 2))}>
            <Download size={13} aria-hidden /> Export
          </Button>
          <Button variant="secondary" size="sm" loading={busy === "import"} onClick={() => fileRef.current?.click()}>
            <Upload size={13} aria-hidden /> Import
          </Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])} />
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setConfirmReset(true)}>
            <RotateCcw size={13} aria-hidden /> Reset to defaults
          </Button>
        </div>
      </Panel>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} size="sm" title="Reset review settings?" description="The popup rules, publishing options, thank-you message and review-site links go back to the defaults. Reviews themselves are not touched.">
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmReset(false)}>
            Cancel
          </Button>
          <Button variant="destructive" loading={busy === "reset"} onClick={() => void reset()}>
            Reset
          </Button>
        </div>
      </Modal>
    </div>
  );
}
