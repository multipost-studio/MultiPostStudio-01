"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { importFeatureFlagsAction, type FlagImportResult } from "@/app/actions/admin-flags";

/** Two steps: pick a file and review exactly what would change, then apply. */
export function FlagsImport() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const [fileName, setFileName] = React.useState("");
  const [preview, setPreview] = React.useState<FlagImportResult | null>(null);
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const close = () => {
    setOpen(false);
    setText("");
    setFileName("");
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  async function choose(file: File) {
    if (file.size > 1_000_000) {
      setPreview({ ok: false, errors: ["The file is larger than 1 MB."] });
      return;
    }
    const content = await file.text();
    setText(content);
    setFileName(file.name);
    setBusy(true);
    setPreview(await importFeatureFlagsAction(content, false));
    setBusy(false);
  }

  async function apply() {
    setBusy(true);
    const res = await importFeatureFlagsAction(text, true);
    setBusy(false);
    if (res.ok) {
      toast({ title: res.applied ? `Imported: ${res.created} created, ${res.updated} updated` : "Nothing to change", tone: "success" });
      close();
      router.refresh();
    } else setPreview(res);
  }

  const changes = preview?.ok ? preview.changes.length : 0;

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)} className="gap-1.5">
        <Upload size={13} /> Import
      </Button>
      <Modal
        open={open}
        onClose={close}
        size="lg"
        title="Import feature flags"
        description="Upload the JSON or CSV exported from this page. Flags in the file are created or updated by key; fields you leave out keep their value; nothing is deleted."
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={close}>Cancel</Button>
            <Button size="sm" onClick={apply} loading={busy} disabled={!preview?.ok || changes === 0}>
              {changes ? `Apply ${changes} change${changes === 1 ? "" : "s"}` : "Apply"}
            </Button>
          </>
        }
      >
        <input ref={fileRef} type="file" accept=".json,.csv,application/json,text/csv" aria-label="Choose a flags file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void choose(f); }} className="block w-full text-[13px] file:mr-3 file:rounded-full file:border file:border-[var(--border-strong)] file:bg-[var(--surface)] file:px-3 file:py-1.5 file:text-[13px] file:font-medium" />
        {fileName && <p className="mt-2 text-[12px] text-[var(--text-subtle)]">{fileName}</p>}

        {preview && !preview.ok && (
          <div role="alert" className="mt-3 rounded-[var(--radius-md)] border border-[var(--danger)]/40 bg-[var(--danger-soft)] p-3 text-[12.5px] text-[var(--danger)]">
            <p className="font-semibold">Nothing will be imported:</p>
            <ul className="mt-1 list-disc pl-5">{preview.errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        )}

        {preview?.ok && (
          <div className="mt-3 space-y-2" aria-live="polite">
            <p className="text-[13px] text-[var(--text)]">
              <strong>{preview.created}</strong> to create · <strong>{preview.updated}</strong> to update · {preview.unchanged} unchanged
            </p>
            {changes === 0 ? (
              <p className="text-[13px] text-[var(--text-muted)]">Every flag in the file already matches. There is nothing to apply.</p>
            ) : (
              <ul className="max-h-64 divide-y divide-[var(--border)] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)]">
                {preview.changes.slice(0, 100).map((c) => (
                  <li key={c.key} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[13px]">
                    <Badge tone={c.kind === "create" ? "success" : "info"} className="text-[10px] uppercase">{c.kind}</Badge>
                    <code className="font-mono text-[12.5px]">{c.key}</code>
                    <span className="text-[var(--text-muted)]">{c.details.join(" · ")}</span>
                  </li>
                ))}
              </ul>
            )}
            {changes > 100 && <p className="text-[12px] text-[var(--text-subtle)]">Showing the first 100 of {changes}.</p>}
          </div>
        )}
      </Modal>
    </>
  );
}
