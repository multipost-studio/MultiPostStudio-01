"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, RefreshCw, RotateCcw, Save, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { importBrandingAction, resetBrandingAction, saveBrandingAction } from "@/app/actions/admin-branding";
import { MAX_IMPORT_BYTES, parseBrandingConfig, type BrandingConfig } from "@/lib/branding/config";
import type { StatCounts } from "@/lib/branding/stats";
import { cn } from "@/lib/utils";
import { Panel } from "./_ui";
import { CreditsTab, SocialTab } from "./_tab-social-credits";
import { InvoiceTab, ShareTab } from "./_tab-share-invoice";
import { StatsTab } from "./_tab-stats";
import { TagsTab } from "./_tab-tags";
import type { TabId } from "./_tabs";

export function BrandingClient({ initialConfig, initialTab, counts }: { initialConfig: BrandingConfig; initialTab: TabId; counts: StatCounts }) {
  const router = useRouter();
  const { toast } = useToast();
  const [saved, setSaved] = React.useState(initialConfig);
  const [draft, setDraft] = React.useState(initialConfig);
  const [tab, setTab] = React.useState<TabId>(initialTab);
  const [busy, setBusy] = React.useState<null | "save" | "import" | "reset">(null);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [importErrors, setImportErrors] = React.useState<string[]>([]);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const tablistRef = React.useRef<HTMLDivElement>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const check = parseBrandingConfig(draft);
  const set = <K extends keyof BrandingConfig>(key: K, value: BrandingConfig[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "social", label: "Social Links", count: draft.social.length },
    { id: "credits", label: "Footer Credits" },
    { id: "tags", label: "Custom Tags", count: draft.tags.length },
    { id: "share", label: "Social Image" },
    { id: "invoice", label: "Invoice Settings" },
    { id: "stats", label: "Platform Stats", count: draft.stats.items.length },
  ];

  function pick(next: TabId) {
    setTab(next);
    // Keep the tab in the address so a refresh or a shared link lands in the same place.
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  }

  function onTabKey(e: React.KeyboardEvent, i: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    pick(next.id);
    requestAnimationFrame(() => tablistRef.current?.querySelector<HTMLElement>(`#brand-tab-${next.id}`)?.focus());
  }

  function adopt(config: BrandingConfig) {
    setSaved(config);
    setDraft(config);
    setErrors([]);
    router.refresh();
  }

  async function save() {
    setBusy("save");
    setErrors([]);
    const res = await saveBrandingAction(draft);
    setBusy(null);
    if (res.ok) {
      adopt(res.config);
      toast({ title: res.message, description: "The public site updates within a minute.", tone: "success" });
    } else setErrors(res.errors);
  }

  function discard() {
    setDraft(saved);
    setErrors([]);
    router.refresh();
    toast({ title: dirty ? "Unsaved changes discarded" : "Up to date", tone: "info" });
  }

  function exportJson() {
    const body = JSON.stringify({ exportedAt: new Date().toISOString(), config: saved }, null, 2);
    const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "site-branding.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importFile(file: File) {
    setImportErrors([]);
    if (file.size > MAX_IMPORT_BYTES) return setImportErrors([`The file is larger than ${MAX_IMPORT_BYTES / 1000} KB.`]);
    setBusy("import");
    const res = await importBrandingAction(await file.text());
    setBusy(null);
    if (fileRef.current) fileRef.current.value = "";
    if (res.ok) {
      adopt(res.config);
      toast({ title: res.message, tone: "success" });
    } else setImportErrors(res.errors);
  }

  async function reset() {
    setBusy("reset");
    const res = await resetBrandingAction();
    setBusy(null);
    setConfirmReset(false);
    if (res.ok) {
      adopt(res.config);
      toast({ title: res.message, tone: "success" });
    } else toast({ title: "Couldn't reset", description: res.errors[0], tone: "error" });
  }

  const problem = errors[0] ?? (!check.ok ? check.errors[0] : null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-[var(--text)] sm:text-[40px]">Site Branding</h1>
          <p className="mt-1 max-w-2xl text-[15px] text-[var(--text-muted)]">Manage social links, footer credits, custom tags, the share image, invoice details and the public platform stats.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={discard}
            aria-label="Reload saved settings"
            title="Reload saved settings"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-strong)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
          >
            <RefreshCw size={16} aria-hidden />
          </button>
          <Button onClick={() => void save()} loading={busy === "save"} disabled={!dirty || !check.ok}>
            <Save size={15} aria-hidden /> Save all
          </Button>
        </div>
      </div>

      {problem && (
        <p role="alert" className="rounded-[var(--radius-md)] border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-[13.5px] text-[var(--danger)]">
          {problem}
        </p>
      )}
      {dirty && !problem && <p className="text-[13.5px] text-[var(--text-muted)]">You have unsaved changes. They apply to every tab, so Save all publishes them together.</p>}

      <div ref={tablistRef} role="tablist" aria-label="Site branding sections" className="mps-scroll-x -mx-1 flex gap-1 overflow-x-auto border-b border-[var(--border)] px-1">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`brand-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`brand-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => pick(t.id)}
            onKeyDown={(e) => onTabKey(e, i)}
            className={cn(
              "relative flex shrink-0 items-center gap-2 px-4 py-3 text-[14px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
              tab === t.id ? "text-[var(--primary)]" : "text-[var(--text-muted)] hover:text-[var(--text)]",
            )}
          >
            {t.label}
            {typeof t.count === "number" && t.count > 0 && (
              <span className="rounded-full bg-[var(--surface-hover)] px-1.5 text-[11.5px] font-bold leading-[18px] text-[var(--text-muted)]">{t.count}</span>
            )}
            {tab === t.id && <span aria-hidden className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-[var(--primary)]" />}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`brand-panel-${tab}`} aria-labelledby={`brand-tab-${tab}`} className="mps-page-in">
        {tab === "social" && <SocialTab draft={draft} set={set} />}
        {tab === "credits" && <CreditsTab draft={draft} set={set} />}
        {tab === "tags" && <TagsTab draft={draft} set={set} />}
        {tab === "share" && <ShareTab draft={draft} set={set} />}
        {tab === "invoice" && <InvoiceTab draft={draft} set={set} />}
        {tab === "stats" && <StatsTab draft={draft} set={set} counts={counts} />}
      </div>

      <Panel title="Backup" description="Export these settings, bring them into another environment, or go back to the built-in branding.">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={exportJson}>
            <Download size={13} aria-hidden /> Export
          </Button>
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} loading={busy === "import"}>
            <Upload size={13} aria-hidden /> Import
          </Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])} />
          <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)} className="ml-auto">
            <RotateCcw size={13} aria-hidden /> Reset to defaults
          </Button>
        </div>
        {importErrors.length > 0 && (
          <ul role="alert" className="mt-3 list-disc space-y-0.5 pl-5 text-[13px] text-[var(--danger)]">
            {importErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </Panel>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset site branding?"
        description="Social links, credits, custom tags, the share image, invoice details and stats all return to the built-in defaults. Export first if you want a copy."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => void reset()} loading={busy === "reset"}>Reset</Button>
          </>
        }
      >
        <p className="text-[13.5px] text-[var(--text-muted)]">The public site changes within a minute.</p>
      </Modal>
    </div>
  );
}
