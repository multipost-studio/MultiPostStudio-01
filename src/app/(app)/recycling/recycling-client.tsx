"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pause, Play, RotateCcw, Shuffle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Switch } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";
import {
  createRecycleRuleAction,
  toggleRecycleRuleAction,
  deleteRecycleRuleAction,
  assignPostToRuleAction,
  togglePostRecyclePauseAction,
  resetPostExhaustionAction,
  savePostVariationsAction,
} from "@/app/actions/misc";

function NewRule({ pillars = [] }: { pillars?: { id: string; name: string }[] }) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus size={15} /> New rule
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New recycling rule"
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" type="submit" form="new-rule" loading={pending}>Create</Button>
          </>
        }
      >
        <form
          id="new-rule"
          className="space-y-3"
          action={async (fd) => {
            setPending(true);
            const res = await createRecycleRuleAction(null, fd);
            setPending(false);
            toast({ title: res.ok ? "Created" : "Failed", description: res.error, tone: res.ok ? "success" : "error" });
            if (res.ok) { setOpen(false); router.refresh(); }
          }}
        >
          <Field label="Rule Name">
            <Input name="name" required placeholder="Evergreen Educational Content" />
          </Field>
          {pillars.length > 0 && (
            <Field label="Content Pillar (Optional)" hint="Restrict recycling to this specific pillar">
              <Select name="pillarId" defaultValue="">
                <option value="">All pillars / general</option>
                {pillars.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>
          )}
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
            <Field label="Every (days)" hint="Base interval">
              <Input name="frequencyDays" type="number" defaultValue={30} min={1} />
            </Field>
            <Field label="Max reposts" hint="Lifetime cap">
              <Input name="maxReposts" type="number" defaultValue={4} min={1} />
            </Field>
            <Field label="Min gap (days)" hint="Rule spacing">
              <Input name="minGapDays" type="number" defaultValue={14} min={1} />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
            <Field label="Decay Multiplier" hint="Extend interval by factor per repost (e.g. 1.25x)">
              <Input name="decayFactor" type="number" step="0.05" defaultValue="1.0" min="1.0" max="3.0" />
            </Field>
            <Field label="Exhaustion Threshold (%)" hint="Stop recycling if ER% falls below">
              <Input name="minEngagementRate" type="number" step="0.1" placeholder="1.0" min="0" max="100" />
            </Field>
          </div>
          <div className="space-y-2 pt-1 border-t border-[var(--border)]">
            <label className="flex items-center justify-between text-[13px] cursor-pointer">
              <span className="text-[var(--text)]">Rotate Text & Hook Variations</span>
              <input type="checkbox" name="rotateVariations" defaultChecked className="rounded" />
            </label>
            <label className="flex items-center justify-between text-[13px] cursor-pointer">
              <span className="text-[var(--text)]">Auto-rotate Hashtag Order</span>
              <input type="checkbox" name="autoHashtagVariation" className="rounded" />
            </label>
          </div>
        </form>
      </Modal>
    </>
  );
}

function RuleRow({ id, enabled }: { id: string; enabled: boolean }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={enabled}
        onCheckedChange={async (v) => {
          await toggleRecycleRuleAction(id, v);
          router.refresh();
        }}
      />
      <Button
        size="icon"
        variant="ghost"
        aria-label="Delete rule"
        onClick={async () => {
          await deleteRecycleRuleAction(id);
          router.refresh();
        }}
      >
        <Trash2 size={13} />
      </Button>
    </div>
  );
}

function MarkEvergreen({
  postId,
  rules,
  attached,
}: {
  postId: string;
  rules: { id: string; name: string }[];
  attached?: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  return (
    <Select
      value={attached ?? ""}
      onChange={async (e) => {
        const res = await assignPostToRuleAction(postId, e.target.value || null);
        toast({ title: res.message ?? "Updated", tone: res.ok ? "success" : "error" });
        router.refresh();
      }}
      size="sm"
      className="w-auto"
    >
      <option value="">Not recycling</option>
      {rules.map((r) => (
        <option key={r.id} value={r.id}>{r.name}</option>
      ))}
    </Select>
  );
}

export function PostRecycleControls({
  postId,
  paused,
  exhausted,
  variationsJson,
}: {
  postId: string;
  paused: boolean;
  exhausted: boolean;
  variationsJson?: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [openModal, setOpenModal] = React.useState(false);
  const [variations, setVariations] = React.useState<string[]>(() => {
    if (!variationsJson) return [];
    try {
      const parsed = JSON.parse(variationsJson);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  });
  const [newVar, setNewVar] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {exhausted && (
        <button
          type="button"
          onClick={async () => {
            await resetPostExhaustionAction(postId);
            toast({ title: "Exhaustion cleared", tone: "success" });
            router.refresh();
          }}
          className="inline-flex items-center gap-1 rounded bg-[var(--danger-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white transition-colors"
          title="Click to clear exhaustion and resume eligibility"
        >
          <RotateCcw size={10} /> Exhausted
        </button>
      )}

      <button
        type="button"
        onClick={async () => {
          const res = await togglePostRecyclePauseAction(postId);
          toast({ title: res.message ?? "Toggled", tone: "success" });
          router.refresh();
        }}
        className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[12px] font-medium border transition-colors ${
          paused
            ? "border-[var(--warning)]/40 bg-[var(--warning-soft)] text-[var(--warning)] hover:bg-[var(--warning)]/20"
            : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]"
        }`}
        title={paused ? "Click to resume recycling" : "Click to pause recycling"}
      >
        {paused ? <Play size={12} /> : <Pause size={12} />}
        <span>{paused ? "Paused" : "Pause"}</span>
      </button>

      <button
        type="button"
        onClick={() => setOpenModal(true)}
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-[12px] font-medium border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors"
        title="Manage alternate text and hook variations"
      >
        <Shuffle size={12} />
        <span>{variations.length > 0 ? `${variations.length} vars` : "Variations"}</span>
      </button>

      <Modal
        open={openModal}
        onClose={() => setOpenModal(false)}
        title="Post Recycle Variations"
        description="The recycling engine will alternate between these text/hook variations on each repost."
        footer={
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpenModal(false)}>Cancel</Button>
            <Button
              size="sm"
              loading={saving}
              onClick={async () => {
                setSaving(true);
                const res = await savePostVariationsAction(postId, variations);
                setSaving(false);
                toast({ title: res.message ?? "Saved", tone: res.ok ? "success" : "error" });
                if (res.ok) {
                  setOpenModal(false);
                  router.refresh();
                }
              }}
            >
              Save variations
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="space-y-2">
            {variations.length === 0 && (
              <p className="text-[13px] text-[var(--text-muted)] py-2">
                No variations yet. Add alternate hooks or rewritten bodies below to keep reposts fresh.
              </p>
            )}
            {variations.map((v, i) => (
              <div key={i} className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-hover)] p-2 text-[13px]">
                <span className="font-semibold text-[var(--text-subtle)] text-[11px] mt-0.5">#{i + 1}</span>
                <p className="flex-1 text-[var(--text)] line-clamp-3">{v}</p>
                <button
                  type="button"
                  onClick={() => setVariations(variations.filter((_, idx) => idx !== i))}
                  className="text-[var(--text-subtle)] hover:text-[var(--danger)]"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>

          <div className="space-y-1.5 pt-2 border-t border-[var(--border)]">
            <label className="text-[12.5px] font-medium text-[var(--text)]">Add new variation</label>
            <Textarea
              value={newVar}
              onChange={(e) => setNewVar(e.target.value)}
              placeholder="Paste alternate hook or full rewrite..."
              className="min-h-[70px] text-[13px]"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={!newVar.trim()}
              onClick={() => {
                if (newVar.trim()) {
                  setVariations([...variations, newVar.trim()]);
                  setNewVar("");
                }
              }}
            >
              <Plus size={13} /> Add to list
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// NOTE: named exports, not a namespace object. { A, B } accessed via property
// in a Server Component breaks across the RSC boundary ("Element type is invalid").
export {
  NewRule as RecycNewRule,
  RuleRow as RecycRuleRow,
  MarkEvergreen as RecycMarkEvergreen,
};
