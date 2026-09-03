"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { PLATFORM_KEYS, PLATFORMS } from "@/lib/constants";
import { createTemplateAction, deleteTemplateAction, applyTemplateAction } from "@/app/actions/templates";

function New() {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus size={15} /> New template
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New template"
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" type="submit" form="new-tpl" loading={pending}>Save</Button>
          </>
        }
      >
        <form
          id="new-tpl"
          className="space-y-3"
          action={async (fd) => {
            setPending(true);
            const res = await createTemplateAction(null, fd);
            setPending(false);
            toast({ title: res.ok ? "Saved" : "Failed", description: res.error, tone: res.ok ? "success" : "error" });
            if (res.ok) { setOpen(false); router.refresh(); }
          }}
        >
          <Field label="Name">
            <Input name="name" required placeholder="Educational carousel" />
          </Field>
          <Field label="Category">
            <Select name="category" defaultValue="general">
              {["general", "education", "promo", "announcement", "story", "ugc"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Body">
            <Textarea name="body" required className="min-h-[140px]" placeholder={"Hook\n\n1. Point one\n2. Point two\n\nSave this ↓"} />
          </Field>
          <div>
            <p className="mb-1.5 text-[14px] font-medium text-[var(--text)]">Platforms</p>
            <div className="flex flex-wrap gap-2">
              {PLATFORM_KEYS.slice(0, 6).map((p) => (
                <label key={p} className="flex items-center gap-1.5 text-[13px] text-[var(--text-muted)]">
                  <input type="checkbox" name="platforms" value={p} className="accent-[var(--primary)]" />
                  {PLATFORMS[p].label}
                </label>
              ))}
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}

type Tpl = { id: string; name: string; category: string; body: string; platforms: string[] };

function List({ templates, canEdit }: { templates: Tpl[]; canEdit: boolean }) {
  const router = useRouter();
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {templates.map((t) => (
        <div key={t.id} className="flex flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-center justify-between">
            <p className="text-[15px] font-semibold text-[var(--text)]">{t.name}</p>
            <Badge tone="neutral">{t.category}</Badge>
          </div>
          <pre className="mt-2 flex-1 whitespace-pre-wrap break-words rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] p-2 font-sans text-[13px] text-[var(--text-muted)]">
            {t.body.slice(0, 240)}
            {t.body.length > 240 ? "…" : ""}
          </pre>
          <div className="mt-2 flex flex-wrap gap-1">
            {t.platforms.map((p) => (
              <span key={p} className="text-[11px] text-[var(--text-subtle)]">
                {PLATFORMS[p as keyof typeof PLATFORMS]?.label ?? p}
              </span>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => applyTemplateAction(t.id)}>
              <PenLine size={13} /> Use
            </Button>
            {canEdit && (
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await deleteTemplateAction(t.id);
                  router.refresh();
                }}
              >
                <Trash2 size={13} />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// NOTE: named exports, not a namespace object. { A, B } accessed via property
// in a Server Component breaks across the RSC boundary ("Element type is invalid").
export { New as TmplNew, List as TmplList };
