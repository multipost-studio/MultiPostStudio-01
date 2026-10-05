"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Megaphone, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import {
  archivePromoCardAction,
  deletePromoCardAction,
  seedStarterPromoCardsAction,
  setPromoCardEnabledAction,
  type PromoResult,
} from "@/app/actions/promo-cards";
import { promoStatus, type PromoStatus } from "@/lib/promo-cards";
import { formatDate, formatNumber } from "@/lib/utils";
import { PromoCardForm, type AdminPromoCard } from "./promo-card-form";

const STATUS_TONE: Record<PromoStatus, BadgeTone> = {
  live: "success",
  scheduled: "info",
  expired: "neutral",
  paused: "warning",
  archived: "neutral",
};

function statusOf(c: AdminPromoCard): PromoStatus {
  return promoStatus({
    enabled: c.enabled,
    archivedAt: c.archivedAt ? new Date(c.archivedAt) : null,
    startsAt: c.startsAt ? new Date(c.startsAt) : null,
    endsAt: c.endsAt ? new Date(c.endsAt) : null,
  });
}

function schedule(c: AdminPromoCard): string {
  if (!c.startsAt && !c.endsAt) return "Always on";
  const s = c.startsAt ? formatDate(c.startsAt) : "Now";
  const e = c.endsAt ? formatDate(c.endsAt) : "No end";
  return `${s} → ${e}`;
}

export function PromoCardsClient({
  cards,
  plans,
  affiliateEnabled,
}: {
  cards: AdminPromoCard[];
  plans: { key: string; name: string }[];
  affiliateEnabled: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [tab, setTab] = React.useState<"active" | "archived">("active");
  const [editing, setEditing] = React.useState<AdminPromoCard | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [formKey, setFormKey] = React.useState(0);

  const archivedCount = cards.filter((c) => c.archivedAt).length;
  const rows = cards.filter((c) => (tab === "archived" ? !!c.archivedAt : !c.archivedAt));
  const planName = (key: string) => plans.find((p) => p.key === key)?.name ?? key;

  async function run(id: string, fn: () => Promise<PromoResult>, success?: string) {
    setBusy(id);
    const res = await fn();
    setBusy(null);
    if (res.ok) {
      if (success) toast({ title: success, tone: "success" });
      router.refresh();
    } else {
      toast({ title: res.error, tone: "error" });
    }
  }

  async function remove(c: AdminPromoCard) {
    const yes = await confirm({
      title: `Delete "${c.title}"?`,
      body: "The card and its impression and click history are removed. Archive it instead to keep the stats.",
      confirmLabel: "Delete card",
      irreversibleNote: "This can't be undone.",
    });
    if (yes) await run(c.id, () => deletePromoCardAction(c.id), "Card deleted");
  }

  const openForm = (card: AdminPromoCard | null) => {
    setEditing(card);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  };
  const openNew = () => openForm(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-[var(--radius-md)] border border-[var(--border)] p-0.5" role="tablist" aria-label="Card filter">
          {(["active", "archived"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-[var(--radius-sm)] px-3 py-1 text-[13px] font-medium capitalize transition-colors ${
                tab === t ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              {t}
              {t === "archived" && archivedCount > 0 ? ` (${archivedCount})` : ""}
            </button>
          ))}
        </div>
        <Button onClick={openNew}>
          <Plus size={15} /> New card
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Megaphone size={20} />}
          title={tab === "archived" ? "No archived cards" : "No promo cards yet"}
          description={
            tab === "archived"
              ? "Archived cards keep their stats and can be restored."
              : "Create a card to promote an upgrade, a feature or an offer in users' sidebars."
          }
          action={
            tab === "active" ? (
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={openNew}>
                  <Plus size={15} /> New card
                </Button>
                {cards.length === 0 && (
                  <Button variant="secondary" loading={busy === "seed"} onClick={() => void run("seed", seedStarterPromoCardsAction, "Starter cards added as drafts")}>
                    <Sparkles size={15} /> Add starter cards
                  </Button>
                )}
              </div>
            ) : undefined
          }
        />
      ) : (
        <Table label="Promo cards">
          <THead>
            <TR>
              <TH>Card</TH>
              <TH>Status</TH>
              <TH>Audience</TH>
              <TH>Schedule</TH>
              <TH className="text-right">Priority</TH>
              <TH className="text-right" title="Unique people who saw the card">Viewers</TH>
              <TH className="text-right" title="Unique people who clicked">Clicks</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <tbody>
            {rows.map((c) => {
              const status = statusOf(c);
              const ctr = c.impressions > 0 ? `${((c.clicks / c.impressions) * 100).toFixed(1)}%` : "—";
              return (
                <TR key={c.id}>
                  <TD className="max-w-[260px]">
                    <p className="truncate font-medium text-[var(--text)]">{c.title}</p>
                    <p className="truncate text-[12.5px] text-[var(--text-muted)]">{c.description}</p>
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={c.enabled}
                        disabled={!!c.archivedAt || busy === c.id}
                        srLabel={`${c.enabled ? "Disable" : "Enable"} ${c.title}`}
                        onCheckedChange={(v) => void run(c.id, () => setPromoCardEnabledAction(c.id, v))}
                      />
                      <Badge tone={STATUS_TONE[status]} className="capitalize">
                        {status}
                      </Badge>
                    </div>
                  </TD>
                  <TD className="text-[13px] text-[var(--text-muted)]">
                    {c.targetPlans.length === 0 ? "All plans" : c.targetPlans.map(planName).join(", ")}
                  </TD>
                  <TD className="whitespace-nowrap text-[13px] text-[var(--text-muted)]">{schedule(c)}</TD>
                  <TD className="text-right tabular-nums">{c.priority}</TD>
                  <TD className="text-right tabular-nums">{formatNumber(c.impressions)}</TD>
                  <TD className="text-right tabular-nums">
                    {formatNumber(c.clicks)}
                    <span className="ml-1 text-[12px] text-[var(--text-subtle)]">{ctr}</span>
                  </TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Edit ${c.title}`}
                        onClick={() => openForm(c)}
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`${c.archivedAt ? "Restore" : "Archive"} ${c.title}`}
                        disabled={busy === c.id}
                        onClick={() =>
                          void run(c.id, () => archivePromoCardAction(c.id, !c.archivedAt), c.archivedAt ? "Card restored" : "Card archived")
                        }
                      >
                        {c.archivedAt ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                      </Button>
                      <Button size="icon" variant="ghost" aria-label={`Delete ${c.title}`} disabled={busy === c.id} onClick={() => void remove(c)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}

      <PromoCardForm
        key={formKey}
        open={formOpen}
        card={editing}
        plans={plans}
        affiliateEnabled={affiliateEnabled}
        onClose={() => setFormOpen(false)}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
