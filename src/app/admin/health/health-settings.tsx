"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  importHealthConfigAction,
  pruneHealthHistoryAction,
  resetHealthConfigAction,
  saveHealthConfigAction,
} from "@/app/actions/admin-health";
import {
  DEFAULT_HEALTH_CONFIG,
  RECORD_EVERY_OPTIONS,
  THRESHOLD_FIELDS,
  parseHealthConfig,
  type HealthConfig,
  type ProbeId,
} from "@/lib/health/config";
import type { ProbeCategory } from "@/lib/health/types";
import { CATEGORY_LABEL } from "./_probe-card";
import { fmtDateTime } from "./_status";

export type ProbeMeta = { id: ProbeId; name: string; category: ProbeCategory; description: string };

const PRUNE_CHOICES = [
  { value: "7", label: "older than 7 days" },
  { value: "30", label: "older than 30 days" },
  { value: "90", label: "older than 90 days" },
  { value: "0", label: "everything" },
];

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--border)]/70 bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
      <h3 className="text-[16px] font-semibold text-[var(--text)]">{title}</h3>
      {description && <p className="mt-1 text-[13px] text-[var(--text-muted)]">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function HealthSettings({
  initialConfig,
  probes,
  history,
}: {
  initialConfig: HealthConfig;
  probes: ProbeMeta[];
  history: { available: boolean; total: number; oldest: string | null; newest: string | null };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [saved, setSaved] = React.useState(initialConfig);
  const [draft, setDraft] = React.useState(initialConfig);
  const [busy, setBusy] = React.useState<null | "save" | "reset" | "import" | "prune">(null);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [importErrors, setImportErrors] = React.useState<string[]>([]);
  const [confirm, setConfirm] = React.useState<null | "reset" | "prune">(null);
  const [pruneDays, setPruneDays] = React.useState("30");
  const fileRef = React.useRef<HTMLInputElement>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const live = parseHealthConfig(draft);

  const setThreshold = (key: keyof HealthConfig["thresholds"], raw: string) => {
    const n = raw === "" ? NaN : Number(raw);
    setDraft((d) => ({ ...d, thresholds: { ...d.thresholds, [key]: n } }));
  };

  async function save() {
    setBusy("save");
    setErrors([]);
    const res = await saveHealthConfigAction(draft);
    setBusy(null);
    if (res.ok) {
      setSaved(res.config);
      setDraft(res.config);
      toast({ title: res.message, description: "New thresholds apply from the next probe run.", tone: "success" });
      router.refresh();
    } else setErrors(res.errors);
  }

  async function reset() {
    setBusy("reset");
    const res = await resetHealthConfigAction();
    setBusy(null);
    setConfirm(null);
    if (res.ok && res.data) {
      setSaved(res.data.config);
      setDraft(res.data.config);
      setErrors([]);
      toast({ title: res.message ?? "Reset", tone: "success" });
      router.refresh();
    } else toast({ title: "Couldn't reset", description: res.error, tone: "error" });
  }

  async function importFile(file: File) {
    setImportErrors([]);
    if (file.size > 20_000) return setImportErrors(["The file is larger than 20 KB."]);
    setBusy("import");
    const res = await importHealthConfigAction(await file.text());
    setBusy(null);
    if (fileRef.current) fileRef.current.value = "";
    if (res.ok) {
      setSaved(res.config);
      setDraft(res.config);
      setErrors([]);
      toast({ title: res.message, tone: "success" });
      router.refresh();
    } else setImportErrors(res.errors);
  }

  async function prune() {
    setBusy("prune");
    const res = await pruneHealthHistoryAction(Number(pruneDays));
    setBusy(null);
    setConfirm(null);
    if (res.ok) {
      toast({ title: res.message ?? "Done", tone: "success" });
      router.refresh();
    } else toast({ title: "Couldn't delete history", description: res.error, tone: "error" });
  }

  const toggleMute = (id: ProbeId) =>
    setDraft((d) => ({ ...d, muted: d.muted.includes(id) ? d.muted.filter((m) => m !== id) : [...d.muted, id] }));

  return (
    <div className="space-y-5">
      <Section title="Thresholds" description="What counts as slow or failing. Every probe compares against these numbers, so change them to match what is normal for your deployment.">
        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
          {THRESHOLD_FIELDS.map((f) => {
            const value = draft.thresholds[f.key];
            const bad = !Number.isInteger(value) || value < f.min || value > f.max;
            return (
              <label key={f.key} className="block">
                <span className="text-[13px] font-medium text-[var(--text)]">{f.label}</span>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={f.min}
                    max={f.max}
                    value={Number.isNaN(value) ? "" : value}
                    onChange={(e) => setThreshold(f.key, e.target.value)}
                    aria-invalid={bad}
                    className={bad ? "border-[var(--danger)]" : undefined}
                  />
                  <span className="w-9 shrink-0 text-[12px] text-[var(--text-subtle)]">{f.unit}</span>
                </div>
                <span className={`mt-1 block text-[12px] ${bad ? "text-[var(--danger)]" : "text-[var(--text-subtle)]"}`}>
                  {bad ? `Enter a whole number from ${f.min} to ${f.max}.` : f.help}
                </span>
              </label>
            );
          })}
        </div>
      </Section>

      <Section title="Monitoring" description="How often a full probe pass is stored without anyone opening this page, and how long results are kept.">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-[13px] font-medium text-[var(--text)]">Record a probe pass</span>
            <Select value={String(draft.recordEveryMin)} onChange={(e) => setDraft((d) => ({ ...d, recordEveryMin: Number(e.target.value) }))} className="mt-1">
              {RECORD_EVERY_OPTIONS.map((m) => (
                <option key={m} value={m}>{m === 0 ? "Never (only when run by hand)" : `Every ${m} minutes`}</option>
              ))}
            </Select>
            <span className="mt-1 block text-[12px] text-[var(--text-subtle)]">Runs on the scheduled-work tick, so it can be no more frequent than your worker or cron.</span>
          </label>
          <label className="block">
            <span className="text-[13px] font-medium text-[var(--text)]">Keep history for</span>
            <div className="mt-1 flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={365}
                value={Number.isNaN(draft.retentionDays) ? "" : draft.retentionDays}
                onChange={(e) => setDraft((d) => ({ ...d, retentionDays: e.target.value === "" ? NaN : Number(e.target.value) }))}
              />
              <span className="w-9 shrink-0 text-[12px] text-[var(--text-subtle)]">days</span>
            </div>
            <span className="mt-1 block text-[12px] text-[var(--text-subtle)]">Older results are deleted automatically once a day (1 to 365).</span>
          </label>
        </div>
      </Section>

      <Section title="Muted probes" description="A muted probe still runs and is still shown, but it no longer affects overall status or raises alerts. Use it for something you have chosen not to fix.">
        <ul className="grid gap-2 sm:grid-cols-2">
          {probes.map((p) => {
            const on = draft.muted.includes(p.id);
            return (
              <li key={p.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2.5 hover:bg-[var(--surface-hover)]">
                  <input type="checkbox" checked={on} onChange={() => toggleMute(p.id)} className="mt-1 h-4 w-4 accent-[var(--primary)]" />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium text-[var(--text)]">{p.name}</span>
                    <span className="block text-[12px] text-[var(--text-subtle)]">{CATEGORY_LABEL[p.category]}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </Section>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--border)]/70 bg-[var(--surface)] p-3 shadow-[var(--shadow-card-hover)]">
        <Button onClick={save} loading={busy === "save"} disabled={!dirty || !live.ok || busy !== null} className="gap-1.5">
          <Save size={14} /> Save settings
        </Button>
        <Button variant="ghost" onClick={() => setDraft(saved)} disabled={!dirty || busy !== null}>Discard changes</Button>
        <Button variant="secondary" onClick={() => setConfirm("reset")} disabled={busy !== null} className="ml-auto gap-1.5">
          <RotateCcw size={14} /> Reset to defaults
        </Button>
        {dirty && !live.ok && <p className="basis-full text-[12.5px] text-[var(--danger)]">{live.errors[0]}</p>}
        {errors.length > 0 && (
          <ul className="basis-full text-[12.5px] text-[var(--danger)]">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>

      <Section title="Import and export settings" description="Settings travel as a small JSON file, so you can copy one environment's thresholds to another or keep them in version control. Import is all-or-nothing and rejects unknown fields.">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" asChild className="gap-1.5">
            <a href="/api/admin/health/export?scope=config&format=json"><Download size={14} /> Export settings (JSON)</a>
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Choose a settings file to import"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
            }}
          />
          <Button variant="secondary" onClick={() => fileRef.current?.click()} loading={busy === "import"} className="gap-1.5">
            <Upload size={14} /> Import settings…
          </Button>
        </div>
        {importErrors.length > 0 && (
          <div role="alert" className="mt-3 rounded-[var(--radius-md)] border border-[var(--danger)]/40 bg-[var(--danger-soft)] p-3 text-[12.5px] text-[var(--danger)]">
            <p className="font-semibold">Nothing was imported:</p>
            <ul className="mt-1 list-disc pl-5">
              {importErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section title="History data" description="Stored probe results used for uptime, trends and incidents.">
        {history.available ? (
          <dl className="grid gap-4 sm:grid-cols-3">
            <div><dt className="text-[12px] text-[var(--text-subtle)]">Stored results</dt><dd className="text-[18px] font-semibold tabular-nums">{history.total.toLocaleString("en-US")}</dd></div>
            <div><dt className="text-[12px] text-[var(--text-subtle)]">Oldest</dt><dd className="text-[14px]">{fmtDateTime(history.oldest)}</dd></div>
            <div><dt className="text-[12px] text-[var(--text-subtle)]">Newest</dt><dd className="text-[14px]">{fmtDateTime(history.newest)}</dd></div>
          </dl>
        ) : (
          <p className="text-[13px] text-[var(--text-muted)]">The history table does not exist yet. It is created by the pending migration on the next deploy.</p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Select aria-label="Delete which history" value={pruneDays} onChange={(e) => setPruneDays(e.target.value)} size="sm" className="w-auto" disabled={!history.available}>
            {PRUNE_CHOICES.map((c) => (
              <option key={c.value} value={c.value}>Delete {c.label}</option>
            ))}
          </Select>
          <Button size="sm" variant="secondary" onClick={() => setConfirm("prune")} disabled={!history.available || busy !== null} className="gap-1.5">
            <Trash2 size={14} /> Delete…
          </Button>
        </div>
      </Section>

      <Modal
        open={confirm === "reset"}
        onClose={() => setConfirm(null)}
        title="Reset to defaults?"
        description="Thresholds, muted probes, recording interval and retention all return to their defaults."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button size="sm" onClick={reset} loading={busy === "reset"}>Reset</Button>
          </>
        }
      >
        <p className="text-[13px] text-[var(--text-muted)]">Recording would be every {DEFAULT_HEALTH_CONFIG.recordEveryMin} minutes, kept for {DEFAULT_HEALTH_CONFIG.retentionDays} days. This is recorded in the audit log.</p>
      </Modal>

      <Modal
        open={confirm === "prune"}
        onClose={() => setConfirm(null)}
        title="Delete health history?"
        description={`This permanently deletes stored probe results ${PRUNE_CHOICES.find((c) => c.value === pruneDays)?.label}. It cannot be undone.`}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button size="sm" variant="danger" onClick={prune} loading={busy === "prune"}>Delete</Button>
          </>
        }
      >
        <p className="text-[13px] text-[var(--text-muted)]">Uptime, trends and incidents are calculated from this data and will restart from the results that remain. The deletion is recorded in the audit log.</p>
      </Modal>
    </div>
  );
}
