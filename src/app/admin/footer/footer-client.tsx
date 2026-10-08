"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, RotateCcw, Save, Undo2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { SiteFooter } from "@/components/marketing/site-footer";
import { importFooterConfigAction, resetFooterConfigAction, saveFooterConfigAction } from "@/app/actions/admin-footer";
import Link from "next/link";
import type { BrandingConfig } from "@/lib/branding/config";
import { MAX_IMPORT_BYTES, isSafeHref, parseFooterConfig, type FooterConfig } from "@/lib/footer/config";
import { resolveFooter, type NavLists } from "@/lib/footer/resolve";
import { AppsEditor, ColumnsEditor, LinkList } from "./_lists";

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--border)]/70 bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
      <h2 className="text-[17px] font-semibold text-[var(--text)]">{title}</h2>
      {description && <p className="mt-1 max-w-2xl text-[13.5px] text-[var(--text-muted)]">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-[13.5px] font-medium text-[var(--text)]">
      {label}
      <div className="mt-1.5 font-normal">{children}</div>
      {hint && <span className="mt-1 block text-[12px] font-normal text-[var(--text-subtle)]">{hint}</span>}
    </label>
  );
}

export function FooterClient({ initialConfig, nav, appUrl, branding }: { initialConfig: FooterConfig; nav: NavLists; appUrl: string; branding: Pick<BrandingConfig, "social" | "credits"> }) {
  const router = useRouter();
  const { toast } = useToast();
  const [saved, setSaved] = React.useState(initialConfig);
  const [draft, setDraft] = React.useState(initialConfig);
  const [busy, setBusy] = React.useState<null | "save" | "import" | "reset">(null);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [importErrors, setImportErrors] = React.useState<string[]>([]);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const check = parseFooterConfig(draft);
  const model = React.useMemo(() => resolveFooter(draft, nav, branding), [draft, nav, branding]);

  const set = <K extends keyof FooterConfig>(key: K, value: FooterConfig[K]) => setDraft((d) => ({ ...d, [key]: value }));

  function adopt(config: FooterConfig) {
    setSaved(config);
    setDraft(config);
    setErrors([]);
    router.refresh();
  }

  async function save() {
    setBusy("save");
    setErrors([]);
    const res = await saveFooterConfigAction(draft);
    setBusy(null);
    if (res.ok) {
      adopt(res.config);
      toast({ title: res.message, description: "The public footer updates within a minute.", tone: "success" });
    } else setErrors(res.errors);
  }

  function exportJson() {
    const body = JSON.stringify({ exportedAt: new Date().toISOString(), config: saved }, null, 2);
    const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "footer-settings.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importFile(file: File) {
    setImportErrors([]);
    if (file.size > MAX_IMPORT_BYTES) return setImportErrors([`The file is larger than ${MAX_IMPORT_BYTES / 1000} KB.`]);
    setBusy("import");
    const res = await importFooterConfigAction(await file.text());
    setBusy(null);
    if (fileRef.current) fileRef.current.value = "";
    if (res.ok) {
      adopt(res.config);
      toast({ title: res.message, tone: "success" });
    } else setImportErrors(res.errors);
  }

  async function reset() {
    setBusy("reset");
    const res = await resetFooterConfigAction();
    setBusy(null);
    setConfirmReset(false);
    if (res.ok) {
      adopt(res.config);
      toast({ title: res.message, tone: "success" });
    } else toast({ title: "Couldn't reset", description: res.errors[0], tone: "error" });
  }

  const ctaBad = draft.cta.href.trim() !== "" && !isSafeHref(draft.cta.href);

  return (
    <div className="space-y-5 pb-24">
      <Section title="Live preview" description="This is the real footer component fed with your unsaved changes. Scroll inside to see all of it.">
        <div className="max-h-[620px] overflow-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg)]">
          <SiteFooter model={model} appUrl={appUrl} />
        </div>
      </Section>

      <Section title="Brand and contact" description="The tagline, how people reach you, and the call to action under them.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Tagline">
            <Input maxLength={140} value={draft.tagline} onChange={(e) => set("tagline", e.target.value)} />
          </Field>
          <Field label="Contact email" hint="Shown as a mailto link. Leave empty to hide.">
            <Input type="email" maxLength={120} value={draft.contact.email} onChange={(e) => set("contact", { ...draft.contact, email: e.target.value })} placeholder="hello@yourdomain.com" />
          </Field>
          <Field label="Phone" hint="Leave empty to hide.">
            <Input maxLength={40} value={draft.contact.phone} onChange={(e) => set("contact", { ...draft.contact, phone: e.target.value })} placeholder="+91 …" />
          </Field>
          <Field label="Address" hint="Line breaks are kept. Leave empty to hide.">
            <Textarea maxLength={200} rows={2} value={draft.contact.address} onChange={(e) => set("contact", { ...draft.contact, address: e.target.value })} />
          </Field>
        </div>
        <div className="mt-5 rounded-[var(--radius-md)] bg-[var(--bg-sunken)] p-3">
          <Switch checked={draft.cta.enabled} onCheckedChange={(v) => set("cta", { ...draft.cta, enabled: v })} label="Show a call-to-action button" />
          {draft.cta.enabled && (
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <Field label="Heading">
                <Input maxLength={100} value={draft.cta.title} onChange={(e) => set("cta", { ...draft.cta, title: e.target.value })} />
              </Field>
              <Field label="Button text">
                <Input maxLength={30} value={draft.cta.label} onChange={(e) => set("cta", { ...draft.cta, label: e.target.value })} />
              </Field>
              <Field label="Button link">
                <Input aria-invalid={ctaBad || undefined} className={ctaBad ? "border-[var(--danger)]" : undefined} value={draft.cta.href} onChange={(e) => set("cta", { ...draft.cta, href: e.target.value })} />
              </Field>
            </div>
          )}
        </div>
      </Section>

      <Section title="Link columns" description="Reorder, rename or switch off any column, hide links that come from Content (CMS), add your own links, or build a whole new column.">
        <ColumnsEditor columns={draft.columns} nav={nav} onChange={(columns) => set("columns", columns)} />
      </Section>

      <Section title="Social icons and credits" description="These are shared across the whole site (footer, search-engine data, share cards), so they live in Site Branding.">
        <Link href="/admin/branding" className="text-[14px] font-medium text-[var(--primary)] hover:underline">
          Edit social links and footer credits in Site Branding →
        </Link>
      </Section>

      <Section title="Other web apps and links" description="Cards linking to your other apps, sites or destinations, shown in their own strip above the legal bar.">
        <Field label="Strip heading">
          <Input maxLength={40} className="mb-3 max-w-sm" value={draft.apps.title} onChange={(e) => set("apps", { ...draft.apps, title: e.target.value })} />
        </Field>
        <AppsEditor items={draft.apps.items} onChange={(items) => set("apps", { ...draft.apps, items })} />
      </Section>

      <Section title="Legal bar and wordmark" description="The small links beside the copyright (Cookie settings is always there) and the giant name at the bottom. The copyright and disclaimer text are under Site Branding → Footer Credits.">
        <LinkList links={draft.bottomLinks} onChange={(links) => set("bottomLinks", links)} max={8} />
        <div className="mt-5 rounded-[var(--radius-md)] bg-[var(--bg-sunken)] p-3">
          <Switch checked={draft.wordmark.enabled} onCheckedChange={(v) => set("wordmark", { ...draft.wordmark, enabled: v })} label="Show the giant wordmark" />
          {draft.wordmark.enabled && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Bold word">
                <Input maxLength={24} value={draft.wordmark.primary} onChange={(e) => set("wordmark", { ...draft.wordmark, primary: e.target.value })} />
              </Field>
              <Field label="Light word">
                <Input maxLength={24} value={draft.wordmark.secondary} onChange={(e) => set("wordmark", { ...draft.wordmark, secondary: e.target.value })} />
              </Field>
            </div>
          )}
        </div>
      </Section>

      <Section title="Backup" description="Export these settings, bring them into another environment, or go back to the built-in footer.">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={exportJson}>
            <Download size={13} aria-hidden /> Export
          </Button>
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} loading={busy === "import"}>
            <Upload size={13} aria-hidden /> Import
          </Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])} />
          <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)} className="ml-auto">
            <RotateCcw size={13} aria-hidden /> Reset to the default footer
          </Button>
        </div>
        {importErrors.length > 0 && (
          <ul role="alert" className="mt-3 list-disc space-y-0.5 pl-5 text-[13px] text-[var(--danger)]">
            {importErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </Section>

      {(dirty || errors.length > 0) && (
        <div className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] z-[55] mx-auto flex max-w-3xl flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-3 shadow-lg md:left-[16rem]">
          <div className="min-w-0 flex-1 text-[13.5px]">
            {errors.length > 0 ? (
              <p role="alert" className="text-[var(--danger)]">{errors[0]}</p>
            ) : !check.ok ? (
              <p className="text-[var(--danger)]">{check.errors[0]}</p>
            ) : (
              <p className="text-[var(--text)]">You have unsaved changes.</p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setDraft(saved); setErrors([]); }} disabled={busy !== null}>
            <Undo2 size={13} aria-hidden /> Discard
          </Button>
          <Button size="sm" onClick={() => void save()} loading={busy === "save"} disabled={!check.ok}>
            <Save size={13} aria-hidden /> Save
          </Button>
        </div>
      )}

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset the footer?"
        description="Your columns, social icons and app links are replaced by the built-in footer. Export first if you want a copy."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => void reset()} loading={busy === "reset"}>Reset</Button>
          </>
        }
      >
        <p className="text-[13.5px] text-[var(--text-muted)]">The public footer changes within a minute.</p>
      </Modal>
    </div>
  );
}
