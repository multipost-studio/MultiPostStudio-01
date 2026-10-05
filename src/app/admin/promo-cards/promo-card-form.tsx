"use client";

import * as React from "react";
import { ImageUp, Loader2, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/ui/toast";
import { PromoCardView } from "@/components/promo/promo-card-view";
import { createPromoCardAction, updatePromoCardAction, uploadPromoImageAction } from "@/app/actions/promo-cards";
import { PROMO_TEMPLATES, templateAudienceNote, templateToInput, type PromoTemplate } from "@/lib/promo-templates";
import { PROMO_ICONS, PROMO_PLACEMENTS, PROMO_TONES, type PromoPlacement, type PromoTone } from "@/lib/promo-cards";
import { cn } from "@/lib/utils";

export type AdminPromoCard = {
  id: string;
  title: string;
  description: string;
  ctaText: string;
  ctaUrl: string;
  icon: string | null;
  imageUrl: string | null;
  tone: PromoTone;
  placement: PromoPlacement;
  priority: number;
  enabled: boolean;
  dismissible: boolean;
  startsAt: string | null;
  endsAt: string | null;
  targetPlans: string[];
  impressions: number;
  clicks: number;
  archivedAt: string | null;
  createdAt: string;
};

type FormState = {
  title: string;
  description: string;
  ctaText: string;
  ctaUrl: string;
  icon: string | null;
  imageUrl: string | null;
  tone: PromoTone;
  placement: PromoPlacement;
  priority: number;
  enabled: boolean;
  dismissible: boolean;
  startsAt: string;
  endsAt: string;
  targetPlans: string[];
};

const EMPTY: FormState = {
  title: "",
  description: "",
  ctaText: "Learn more",
  ctaUrl: "/",
  icon: "Sparkles",
  imageUrl: null,
  tone: "brand",
  placement: "sidebar",
  priority: 0,
  enabled: false,
  dismissible: true,
  startsAt: "",
  endsAt: "",
  targetPlans: [],
};

/** ISO (UTC) -> value for <input type="datetime-local"> in the admin's own timezone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const toIso = (local: string) => (local ? new Date(local).toISOString() : null);

function fromCard(c: AdminPromoCard): FormState {
  return { ...c, startsAt: toLocalInput(c.startsAt), endsAt: toLocalInput(c.endsAt) };
}

export function PromoCardForm({
  open,
  card,
  plans,
  affiliateEnabled,
  onClose,
  onSaved,
}: {
  open: boolean;
  card: AdminPromoCard | null;
  plans: { key: string; name: string }[];
  /** Site setting: the affiliate template is only usable while the program is on. */
  affiliateEnabled: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  // The parent remounts this component (via `key`) for every open, so state
  // initialises from props here instead of being synced in an effect.
  const [form, setForm] = React.useState<FormState>(() => (card ? fromCard(card) : EMPTY));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const [templateId, setTemplateId] = React.useState("");
  const template = PROMO_TEMPLATES.find((t) => t.id === templateId);
  const unavailable = (t: PromoTemplate) => t.requiresSetting === "affiliateEnabled" && !affiliateEnabled;

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = PROMO_TEMPLATES.find((x) => x.id === id);
    if (!t || unavailable(t)) return;
    const i = templateToInput(t);
    setForm((f) => ({
      ...f,
      title: t.title,
      description: t.description,
      ctaText: t.ctaText,
      ctaUrl: t.ctaUrl,
      icon: t.icon,
      imageUrl: null,
      tone: t.tone,
      placement: (i.placement ?? "sidebar") as PromoPlacement,
      priority: i.priority ?? 0,
      targetPlans: i.targetPlans ?? [],
    }));
    setErrors({});
  }

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function upload(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.set("file", file);
    const res = await uploadPromoImageAction(fd);
    setUploading(false);
    if (res.ok && res.url) {
      set("imageUrl", res.url);
      setErrors((e) => ({ ...e, imageUrl: "" }));
    } else if (!res.ok) {
      setErrors((e) => ({ ...e, imageUrl: res.error }));
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function save() {
    setSaving(true);
    const payload = { ...form, startsAt: toIso(form.startsAt), endsAt: toIso(form.endsAt) };
    const res = card ? await updatePromoCardAction(card.id, payload) : await createPromoCardAction(payload);
    setSaving(false);
    if (res.ok) {
      toast({ title: card ? "Card updated" : "Card created", tone: "success" });
      onSaved();
      onClose();
    } else {
      setErrors(res.fieldErrors ?? {});
      toast({ title: res.error, tone: "error" });
    }
  }

  const togglePlan = (key: string) =>
    set("targetPlans", form.targetPlans.includes(key) ? form.targetPlans.filter((k) => k !== key) : [...form.targetPlans, key]);

  const previewCard = {
    id: "preview",
    title: form.title || "Card title",
    description: form.description || "A short description of the offer or feature.",
    ctaText: form.ctaText || "Learn more",
    ctaUrl: form.ctaUrl || "/",
    icon: form.icon,
    imageUrl: form.imageUrl,
    tone: form.tone,
    dismissible: form.dismissible,
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={card ? "Edit promo card" : "New promo card"}
      description="Cards appear in users' sidebars. Nothing is shown until it is published."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            {card ? "Save changes" : form.enabled ? "Create and publish" : "Create draft"}
          </Button>
        </>
      }
    >
      <div className={cn("grid gap-6", form.placement === "dashboard" ? "lg:grid-cols-[1fr_380px]" : "lg:grid-cols-[1fr_260px]")}>
        <div className="space-y-4 lg:order-1">
          {!card && (
            <Field label="Start from a template" hint={template ? templateAudienceNote(template) : "Optional. Fills the form with a ready-made card you can edit. It stays a draft until you publish it."}>
              <Select value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
                <option value="">Blank card</option>
                {(["Upgrade", "Create", "Grow", "Analyze", "Team", "Earn"] as const).map((cat) => (
                  <optgroup key={cat} label={cat}>
                    {PROMO_TEMPLATES.filter((t) => t.category === cat).map((t) => (
                      <option key={t.id} value={t.id} disabled={unavailable(t)}>
                        {t.title}
                        {unavailable(t) ? " (turn on the affiliate program first)" : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Title" error={errors.title} hint={`${form.title.length}/60`}>
            <Input value={form.title} maxLength={60} onChange={(e) => set("title", e.target.value)} placeholder="Upgrade to Pro" />
          </Field>
          <Field label="Description" error={errors.description} hint={`${form.description.length}/160`}>
            <Textarea value={form.description} maxLength={160} rows={3} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Button text" error={errors.ctaText}>
              <Input value={form.ctaText} maxLength={24} onChange={(e) => set("ctaText", e.target.value)} />
            </Field>
            <Field label="Button link" error={errors.ctaUrl} hint="In-app path or https link">
              <Input value={form.ctaUrl} onChange={(e) => set("ctaUrl", e.target.value)} placeholder="/settings/billing" />
            </Field>
          </div>

          <div>
            <p className="mb-1.5 text-[14px] font-medium text-[var(--text)]">Icon or image</p>
            <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Icon">
              {PROMO_ICONS.map((name) => (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={form.icon === name && !form.imageUrl}
                  aria-label={name}
                  onClick={() => setForm((f) => ({ ...f, icon: name, imageUrl: null }))}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)]",
                    form.icon === name && !form.imageUrl ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]" : "border-[var(--border)]",
                  )}
                >
                  <Icon name={name} size={15} />
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="sr-only"
                aria-label="Upload card image"
                onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])}
              />
              <Button type="button" size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImageUp size={14} />}
                {form.imageUrl ? "Replace image" : "Upload image"}
              </Button>
              {form.imageUrl && (
                <Button type="button" size="sm" variant="ghost" onClick={() => set("imageUrl", null)}>
                  <Trash2 size={14} /> Remove
                </Button>
              )}
              <span className="text-[12px] text-[var(--text-subtle)]">PNG, JPG, WebP or GIF · max 2 MB</span>
            </div>
            {errors.imageUrl && <p className="mt-1 text-[13px] text-[var(--danger)]">{errors.imageUrl}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Style">
              <Select value={form.tone} onChange={(e) => set("tone", e.target.value as PromoTone)}>
                {PROMO_TONES.map((t) => (
                  <option key={t} value={t}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Placement">
              <Select value={form.placement} onChange={(e) => set("placement", e.target.value as PromoPlacement)}>
                {PROMO_PLACEMENTS.map((p) => (
                  <option key={p} value={p}>
                    {p[0].toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority" error={errors.priority} hint="Higher shows first">
              <Input type="number" value={form.priority} onChange={(e) => set("priority", Number.parseInt(e.target.value || "0", 10) || 0)} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts" hint="Optional · your local time">
              <Input type="datetime-local" value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
            </Field>
            <Field label="Ends" error={errors.endsAt} hint="Optional · your local time">
              <Input type="datetime-local" value={form.endsAt} onChange={(e) => set("endsAt", e.target.value)} />
            </Field>
          </div>

          <div>
            <p className="mb-1.5 text-[14px] font-medium text-[var(--text)]">Show to</p>
            <div className="flex flex-wrap gap-1.5">
              <span className="sr-only">Plans</span>
              {plans.map((p) => {
                const on = form.targetPlans.includes(p.key);
                return (
                  <button
                    key={p.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => togglePlan(p.key)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-[13px] transition-colors",
                      on ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]" : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]",
                    )}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[12px] text-[var(--text-subtle)]">
              {form.targetPlans.length === 0 ? "Every plan sees this card." : "Only organizations on the selected plans see this card."}
            </p>
          </div>

          <div className="flex flex-wrap gap-x-8 gap-y-3 border-t border-[var(--border)] pt-4">
            <Switch checked={form.dismissible} onCheckedChange={(v) => set("dismissible", v)} label="Users can dismiss" />
            <Switch checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} label="Published" />
          </div>
        </div>

        <aside className="order-first lg:order-2" aria-label="Preview">
          <div className="lg:sticky lg:top-0">
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Live preview</p>
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
              <PromoCardView card={previewCard} preview layout={form.placement === "dashboard" ? "banner" : "card"} />
            </div>
            <p className="mt-2 text-[12px] text-[var(--text-subtle)]">{form.placement === "dashboard" ? "Shown as a banner above the dashboard widgets (one card at a time)." : "Shown at sidebar width. Long text is clamped to three lines."}</p>
          </div>
        </aside>
      </div>
    </Modal>
  );
}
