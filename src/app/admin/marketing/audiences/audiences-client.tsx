"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Gift, Loader2, Megaphone, Save, Send, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Segmented } from "@/components/ui/controls";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import {
  broadcastToAudienceAction,
  deleteSegmentAction,
  previewAudienceAction,
  saveSegmentAction,
  type AudiencePreview,
} from "@/app/actions/marketing-admin";
import { describeFilter, isEmptyFilter, normalizeSegmentFilter, type SegmentFilter } from "@/lib/audience";
import { CHANNELS } from "@/lib/attribution";
import { formatDate } from "@/lib/utils";
import { Chip, ChipInput } from "@/components/ui/chips";

export type SavedSegment = { id: string; name: string; filter: SegmentFilter };

const DEBOUNCE_MS = 450;

export function AudiencesClient({
  initial,
  saved,
  facets,
  plans,
}: {
  initial: SegmentFilter;
  saved: SavedSegment[];
  facets: { sources: string[]; mediums: string[]; campaigns: string[] };
  plans: { key: string; name: string }[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [filter, setFilter] = React.useState<SegmentFilter>(initial);
  const [settled, setSettled] = React.useState<{ key: string; preview: AudiencePreview | null; error: string | null } | null>(null);
  const [name, setName] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [messageOpen, setMessageOpen] = React.useState(false);

  // Live audience size: debounced, and a slow response never overwrites a newer one.
  // "Loading" is derived (the settled result is for a different filter), not set from the effect.
  const key = JSON.stringify(filter);
  const latestKey = React.useRef(key);
  React.useEffect(() => {
    latestKey.current = key;
    const t = setTimeout(async () => {
      const res = await previewAudienceAction(filter);
      if (latestKey.current !== key) return;
      setSettled(res.ok ? { key, preview: res.preview, error: null } : { key, preview: null, error: res.error });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [key, filter]);
  const loading = settled?.key !== key;
  const preview = settled?.preview ?? null;
  const error = settled?.error ?? null;

  const patch = (p: Partial<SegmentFilter>) => setFilter((f) => ({ ...f, ...p }));
  const toggle = <K extends "channels" | "plans">(k: K, v: SegmentFilter[K][number]) =>
    setFilter((f) => ({ ...f, [k]: (f[k] as string[]).includes(v as string) ? (f[k] as string[]).filter((x) => x !== v) : [...(f[k] as string[]), v] }));

  const empty = isEmptyFilter(filter);
  const exportHref = `/api/admin/audience-export?f=${encodeURIComponent(JSON.stringify(filter))}`;
  const promoParams = new URLSearchParams({ new: "1" });
  if (filter.channels.length) promoParams.set("channels", filter.channels.join(","));
  if (filter.sources.length) promoParams.set("sources", filter.sources.join(","));
  if (filter.campaigns.length) promoParams.set("campaigns", filter.campaigns.join(","));
  const promoTargetable = filter.channels.length + filter.sources.length + filter.campaigns.length > 0;

  async function save() {
    setSaving(true);
    const res = await saveSegmentAction({ name, filter });
    setSaving(false);
    if (res.ok) {
      toast({ title: "Audience saved", tone: "success" });
      setName("");
      router.refresh();
    } else toast({ title: res.error, tone: "error" });
  }

  async function remove(s: SavedSegment) {
    const yes = await confirm({ title: `Delete "${s.name}"?`, body: "Only the saved filter is removed. No users are affected.", confirmLabel: "Delete audience" });
    if (!yes) return;
    const res = await deleteSegmentAction(s.id);
    if (res.ok) router.refresh();
    else toast({ title: res.error, tone: "error" });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Who are you targeting?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <Group label="Channel">
              {CHANNELS.map((c) => (
                <Chip key={c} on={filter.channels.includes(c)} onClick={() => toggle("channels", c)}>
                  {c}
                </Chip>
              ))}
            </Group>
            <ChipInput label="Source" values={filter.sources} suggestions={facets.sources} onChange={(v) => patch({ sources: v })} placeholder="google, newsletter…" />
            <ChipInput label="Medium" values={filter.mediums} suggestions={facets.mediums} onChange={(v) => patch({ mediums: v })} placeholder="cpc, email…" />
            <ChipInput label="Campaign" values={filter.campaigns} suggestions={facets.campaigns} onChange={(v) => patch({ campaigns: v })} placeholder="spring_launch…" />
            <Group label="Current plan">
              {plans.map((p) => (
                <Chip key={p.key} on={filter.plans.includes(p.key)} onClick={() => toggle("plans", p.key)}>
                  {p.name}
                </Chip>
              ))}
            </Group>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Signed up from">
                <Input type="date" value={filter.from ?? ""} onChange={(e) => patch({ from: e.target.value || null })} />
              </Field>
              <Field label="Signed up to">
                <Input type="date" value={filter.to ?? ""} onChange={(e) => patch({ to: e.target.value || null })} />
              </Field>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-[var(--text-muted)]">Match on</span>
                <Segmented label="Touch" value={filter.touch} onChange={(v) => patch({ touch: v })} options={[{ value: "first", label: "First touch" }, { value: "last", label: "Last touch" }]} />
              </div>
              {!empty && (
                <Button variant="ghost" size="sm" onClick={() => setFilter(normalizeSegmentFilter({}))}>
                  Clear filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {saved.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Saved audiences</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-[var(--border)]">
                {saved.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 py-2.5 first:pt-0 last:pb-0">
                    <button type="button" onClick={() => setFilter(s.filter)} className="min-w-0 flex-1 rounded-[var(--radius-sm)] text-left hover:bg-[var(--surface-hover)]">
                      <p className="truncate text-[14px] font-medium text-[var(--text)]">{s.name}</p>
                      <p className="truncate text-[12.5px] text-[var(--text-muted)]">{describeFilter(s.filter)}</p>
                    </button>
                    <Button size="icon" variant="ghost" aria-label={`Delete ${s.name}`} onClick={() => void remove(s)}>
                      <Trash2 size={14} />
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-start justify-between gap-3">
              <div aria-live="polite">
                <p className="flex items-center gap-2 text-[2rem] font-bold leading-none tabular-nums text-[var(--text)]">
                  {preview ? preview.total.toLocaleString() : "—"}
                  {loading && <Loader2 size={16} className="animate-spin text-[var(--text-subtle)]" aria-label="Updating" />}
                </p>
                <p className="mt-1.5 text-[13px] text-[var(--text-muted)]">{preview ? `people · ${preview.description}` : "people"}</p>
              </div>
              <Users size={20} className="text-[var(--text-subtle)]" aria-hidden />
            </div>

            {error && (
              <p role="alert" className="rounded-[var(--radius-sm)] bg-[var(--danger-soft)] p-2.5 text-[13px] text-[var(--danger)]">
                {error}
              </p>
            )}
            {preview?.truncated && <p className="text-[12.5px] text-[var(--warning)]">Very large audience: counts are capped. Narrow the filter for exact numbers.</p>}
            {preview && preview.byPlan.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {preview.byPlan.map((p) => (
                  <Badge key={p.plan} tone="neutral">
                    {p.plan} · {p.count}
                  </Badge>
                ))}
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <Button onClick={() => setMessageOpen(true)} disabled={empty || !preview || preview.total === 0 || loading}>
                <Send size={15} aria-hidden /> Message in-app
              </Button>
              {preview && preview.total > 0 ? (
                <Button variant="secondary" asChild>
                  <a href={exportHref}>
                    <Download size={15} aria-hidden /> Export CSV
                  </a>
                </Button>
              ) : (
                <Button variant="secondary" disabled>
                  <Download size={15} aria-hidden /> Export CSV
                </Button>
              )}
              {promoTargetable ? (
                <Button variant="secondary" asChild>
                  <Link href={`/admin/promo-cards?${promoParams}`}>
                    <Gift size={15} aria-hidden /> Create promo card
                  </Link>
                </Button>
              ) : (
                <Button variant="secondary" disabled>
                  <Gift size={15} aria-hidden /> Create promo card
                </Button>
              )}
              <Button variant="secondary" asChild>
                <Link href="/admin/broadcast">
                  <Megaphone size={15} aria-hidden /> All-user broadcast
                </Link>
              </Button>
            </div>
            {empty && <p className="text-[12.5px] text-[var(--text-subtle)]">Choose at least one filter to message an audience. To reach every user, use the all-user broadcast.</p>}
            {!promoTargetable && !empty && <p className="text-[12.5px] text-[var(--text-subtle)]">Promo cards target by channel, source or campaign. Add one of those to create a targeted card.</p>}

            <div className="flex items-end gap-2 border-t border-[var(--border)] pt-4">
              <div className="min-w-0 flex-1">
                <Field label="Save this audience">
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Google Ads leads, free plan" maxLength={80} />
                </Field>
              </div>
              <Button variant="secondary" onClick={() => void save()} loading={saving} disabled={!name.trim() || empty}>
                <Save size={15} aria-hidden /> Save
              </Button>
            </div>
          </CardContent>
        </Card>

        {preview && preview.sample.length > 0 && (
          <div className="space-y-2">
            <p className="text-[13px] text-[var(--text-muted)]">
              Showing {preview.sample.length} of {preview.total.toLocaleString()}
            </p>
            <Table label="Audience sample">
              <THead>
                <TR>
                  <TH>Person</TH>
                  <TH>Arrived via</TH>
                  <TH>Plan</TH>
                  <TH>Signed up</TH>
                </TR>
              </THead>
              <tbody>
                {preview.sample.map((m) => (
                  <TR key={m.id}>
                    <TD className="max-w-[220px]">
                      <p className="truncate font-medium text-[var(--text)]">{m.name}</p>
                      <p className="truncate text-[12.5px] text-[var(--text-muted)]">{m.email}</p>
                    </TD>
                    <TD className="text-[13px] text-[var(--text-muted)]">
                      {m.channel ?? <span className="italic">not tracked</span>}
                      {m.source ? ` · ${m.source}` : ""}
                      {m.campaign ? ` · ${m.campaign}` : ""}
                    </TD>
                    <TD className="text-[13px]">{m.plan}</TD>
                    <TD className="whitespace-nowrap text-[13px] text-[var(--text-muted)]">{formatDate(m.createdAt)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
        )}
        {preview && preview.total === 0 && !loading && (
          <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] p-6 text-center text-[14px] text-[var(--text-muted)]">
            No one matches yet. Attribution starts with the first tracked signup, so older accounts only match filters that don&apos;t depend on how they arrived.
          </p>
        )}
      </div>

      <MessageModal open={messageOpen} onClose={() => setMessageOpen(false)} filter={filter} total={preview?.total ?? 0} />
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-[var(--text-muted)]">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function MessageModal({ open, onClose, filter, total }: { open: boolean; onClose: () => void; filter: SegmentFilter; total: number }) {
  const { toast } = useToast();
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [link, setLink] = React.useState("");
  const [sending, setSending] = React.useState(false);

  async function send() {
    setSending(true);
    const res = await broadcastToAudienceAction({ filter, title, body, linkUrl: link, expectedTotal: total });
    setSending(false);
    if (res.ok) {
      toast({ title: `Sent to ${res.sent.toLocaleString()} ${res.sent === 1 ? "person" : "people"}`, tone: "success" });
      setTitle("");
      setBody("");
      setLink("");
      onClose();
    } else toast({ title: res.error, tone: "error" });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Message this audience"
      description={`${total.toLocaleString()} ${total === 1 ? "person" : "people"} · ${describeFilter(filter)}. It appears in their notification bell right away.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={() => void send()} loading={sending} disabled={!title.trim() || !body.trim()}>
            <Send size={15} aria-hidden /> Send to {total.toLocaleString()}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title" hint={`${title.length}/140`}>
          <Input value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Message" hint={`${body.length}/2000`}>
          <Textarea value={body} maxLength={2000} rows={4} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <Field label="Link (optional)" hint="In-app path like /integrations, or an https link">
          <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="/integrations" />
        </Field>
        <p className="text-[12.5px] text-[var(--text-subtle)]">Sends are recorded in the audit log. If the audience changes before you send, the send is stopped so you can review it again.</p>
      </div>
    </Modal>
  );
}
