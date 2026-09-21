"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, X, MessageSquare, Plus, Trash2, GitBranch, Clock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { PlatformBadge } from "@/components/brand";
import { cn, relativeTime } from "@/lib/utils";
import { WORKSPACE_ROLES, ROLE_LABELS } from "@/lib/constants";
import {
  decideApprovalAction,
  addApprovalCommentAction,
  saveApprovalFlowAction,
  resubmitApprovalAction,
} from "@/app/actions/approvals";
import {
  REVISION_REASONS,
  getRevisionReason,
  calculateStageSla,
  type RevisionReasonKey,
} from "@/lib/approval-workflows";
import { confirmDestructive } from "@/components/ui/confirm";

type Req = {
  id: string;
  status: string;
  currentStage: number;
  stageEnteredAt?: string | null;
  resubmissionCount?: number;
  createdAt: string;
  post: { id: string; title: string; author: string; bodies: { platform: string; body: string }[] };
  stages: {
    name: string;
    roleGate: string;
    timeoutHours?: number | null;
    timeoutAction?: string | null;
    escalateToRole?: string | null;
  }[];
  actions: {
    id: string;
    action: string;
    comment: string | null;
    reasonCategory?: string | null;
    actor: string;
    createdAt: string;
  }[];
};

function Queue({ requests, canApprove }: { requests: Req[]; canApprove: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [comment, setComment] = React.useState<Record<string, string>>({});
  const [selectedReason, setSelectedReason] = React.useState<Record<string, RevisionReasonKey>>({});
  const [busy, setBusy] = React.useState<string | null>(null);

  async function decide(id: string, decision: "approve" | "reject" | "request_changes") {
    // Reject / request-changes without a reason produces an audit trail that
    // says nothing — the placeholder promises "required", so enforce it.
    if ((decision === "reject" || decision === "request_changes") && !(comment[id] ?? "").trim()) {
      toast({ title: "Add a comment first", description: "Rejections and change requests need a reason for the audit trail.", tone: "warning" });
      return;
    }
    if (decision === "reject") {
      const ok = await confirmDestructive({
        title: "Reject this post?",
        body: "It goes back to draft. The author will see your comment.",
        confirmLabel: "Reject post",
      });
      if (!ok) return;
    }
    setBusy(id + decision);
    const reason = decision === "request_changes" ? (selectedReason[id] ?? "copy_edit") : undefined;
    const res = await decideApprovalAction(id, decision, comment[id], reason);
    setBusy(null);
    toast({ title: res.ok ? res.message ?? "Recorded" : "Failed", description: res.error, tone: res.ok ? "success" : "error" });
    if (res.ok) {
      setComment((c) => ({ ...c, [id]: "" }));
      router.refresh();
    }
  }

  async function handleResubmit(id: string, postId: string) {
    setBusy(id + "resubmit");
    const res = await resubmitApprovalAction(postId, comment[id]);
    setBusy(null);
    toast({ title: res.ok ? res.message ?? "Resubmitted" : "Failed", description: res.error, tone: res.ok ? "success" : "error" });
    if (res.ok) {
      setComment((c) => ({ ...c, [id]: "" }));
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      {requests.map((r) => {
        const currentStageDef = r.stages[r.currentStage];
        const sla = calculateStageSla(
          r.stageEnteredAt,
          currentStageDef?.timeoutHours,
          currentStageDef?.timeoutAction,
          currentStageDef?.escalateToRole,
        );

        return (
          <div key={r.id} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link href={`/composer/${r.post.id}`} className="text-[15px] font-semibold text-[var(--text)] hover:underline truncate">
                    {r.post.title}
                  </Link>
                  {r.resubmissionCount != null && r.resubmissionCount > 0 && (
                    <Badge tone="primary">
                      Rev #{r.resubmissionCount + 1}
                    </Badge>
                  )}
                </div>
                <p className="text-[13px] text-[var(--text-subtle)]">
                  by {r.post.author} · {relativeTime(r.createdAt)}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {sla.hasSla && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      sla.statusLevel === "overdue"
                        ? "bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger)]/30"
                        : sla.statusLevel === "critical"
                          ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                          : sla.statusLevel === "warning"
                            ? "bg-[var(--warning-soft)] text-[var(--warning)]"
                            : "bg-[var(--surface-hover)] text-[var(--text-subtle)]",
                    )}
                    title={
                      sla.timeoutAction
                        ? `Timeout action: ${sla.timeoutAction}${sla.escalateToRole ? ` to ${sla.escalateToRole}` : ""}`
                        : undefined
                    }
                  >
                    <Clock size={11} />
                    {sla.formattedTimeLeft}
                  </span>
                )}
                <Badge tone={r.status === "changes_requested" ? "warning" : "info"}>
                  {r.status === "changes_requested" ? "Changes requested" : "In review"}
                </Badge>
              </div>
            </div>

            {/* stage tracker */}
            <ol aria-label="Approval progress" className="mt-3 flex flex-wrap items-center gap-1.5">
              {r.stages.map((s, i) => {
                const state = i < r.currentStage ? "done" : i === r.currentStage ? "current" : "upcoming";
                return (
                  <li key={i} className="flex items-center gap-1.5" aria-current={state === "current" ? "step" : undefined}>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[12px] font-medium",
                        state === "done"
                          ? "bg-[var(--success-soft)] text-[var(--success)]"
                          : state === "current"
                            ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                            : "bg-[var(--bg-sunken)] text-[var(--text-subtle)]",
                      )}
                    >
                      <span aria-hidden>{state === "done" ? "✓ " : ""}</span>
                      {s.name}
                      <span className="sr-only">
                        {state === "done" ? " (completed)" : state === "current" ? " (current step)" : " (upcoming)"}
                      </span>
                    </span>
                    {i < r.stages.length - 1 && (
                      <span aria-hidden className="text-[var(--text-subtle)]">
                        →
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>

            {/* content preview */}
            <div className="mt-3 space-y-1.5">
              {r.post.bodies.slice(0, 2).map((b, i) => (
                <div key={i} className="flex gap-2 rounded-[var(--radius-md)] bg-[var(--bg-sunken)] p-2.5 text-[13px]">
                  <PlatformBadge platform={b.platform} size={16} />
                  <p className="whitespace-pre-wrap text-[var(--text-muted)] line-clamp-3">{b.body}</p>
                </div>
              ))}
            </div>

            {/* timeline history */}
            {r.actions.length > 0 && (
              <ul className="mt-3 space-y-1.5 border-l-2 border-[var(--border)] pl-3">
                {r.actions.map((a) => {
                  const reason = getRevisionReason(a.reasonCategory);
                  return (
                    <li key={a.id} className="text-[13px] text-[var(--text-muted)] flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-[var(--text)]">{a.actor}</span>
                      <span className="text-[var(--text-subtle)]">
                        {a.action === "request_changes"
                          ? "requested changes"
                          : a.action === "resubmit"
                            ? "resubmitted revised post"
                            : a.action.replace(/_/g, " ")}
                      </span>
                      {reason && (
                        <Badge tone={reason.badgeTone}>
                          {reason.label}
                        </Badge>
                      )}
                      {a.comment && <span className="italic text-[var(--text)]">“{a.comment}”</span>}
                      <span className="text-[var(--text-subtle)] text-[11px]">· {relativeTime(a.createdAt)}</span>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* actions & feedback input */}
            <div className="mt-3">
              {canApprove && (
                <div className="mb-2 flex flex-wrap items-center gap-1">
                  <span className="text-[11px] font-medium text-[var(--text-subtle)] mr-1">Change category:</span>
                  {REVISION_REASONS.map((reason) => {
                    const selected = (selectedReason[r.id] ?? "copy_edit") === reason.key;
                    return (
                      <button
                        key={reason.key}
                        type="button"
                        onClick={() => setSelectedReason((prev) => ({ ...prev, [r.id]: reason.key }))}
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer",
                          selected
                            ? "bg-[var(--primary)] text-white shadow-xs"
                            : "bg-[var(--surface-hover)] text-[var(--text-muted)] hover:text-[var(--text)]",
                        )}
                        title={reason.description}
                      >
                        {reason.label}
                      </button>
                    );
                  })}
                </div>
              )}

              <Textarea
                value={comment[r.id] ?? ""}
                onChange={(e) => setComment((c) => ({ ...c, [r.id]: e.target.value }))}
                placeholder={
                  r.status === "changes_requested"
                    ? "Add notes on what you revised (optional for resubmission)..."
                    : "Add a comment (required for rejection / changes)…"
                }
                className="min-h-[52px]"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {canApprove ? (
                  <>
                    <Button size="sm" loading={busy === r.id + "approve"} onClick={() => decide(r.id, "approve")}>
                      <Check size={13} /> Approve stage
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy === r.id + "request_changes"}
                      onClick={() => decide(r.id, "request_changes")}
                    >
                      <MessageSquare size={13} /> Request changes
                    </Button>
                    <Button size="sm" variant="ghost" loading={busy === r.id + "reject"} onClick={() => decide(r.id, "reject")}>
                      <X size={13} /> Reject
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      const res = await addApprovalCommentAction(r.id, comment[r.id] ?? "");
                      toast({ title: res.ok ? "Comment added" : "Failed", description: res.error, tone: res.ok ? "success" : "error" });
                      if (res.ok) { setComment((c) => ({ ...c, [r.id]: "" })); router.refresh(); }
                    }}
                  >
                    <MessageSquare size={13} /> Comment
                  </Button>
                )}

                {r.status === "changes_requested" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busy === r.id + "resubmit"}
                    onClick={() => handleResubmit(r.id, r.post.id)}
                  >
                    <RotateCcw size={13} /> Resubmit revisions
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

type StageEdit = {
  name: string;
  roleGate: string;
  timeoutHours?: number | null;
  timeoutAction?: string | null;
  escalateToRole?: string | null;
};
type Flow = { id: string; name: string; isDefault: boolean; stages: StageEdit[]; usage: number };

function Flows({ flows, canConfigure }: { flows: Flow[]; canConfigure: boolean }) {
  return (
    <div className="mt-8">
      <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
        <GitBranch size={13} /> Approval flows
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {flows.map((f) => (
          <div key={f.id} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-semibold text-[var(--text)]">{f.name}</p>
              {f.isDefault && <Badge tone="primary">Default</Badge>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px]">
              {f.stages.map((s, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <span className="rounded-full bg-[var(--bg-sunken)] px-2 py-0.5 text-[var(--text-muted)]">
                    {s.name} <span className="text-[var(--text-subtle)]">({ROLE_LABELS[s.roleGate] ?? s.roleGate})</span>
                  </span>
                  {i < f.stages.length - 1 && <span className="text-[var(--text-subtle)]">→</span>}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-[var(--text-subtle)]">{f.usage} requests processed</p>
            {canConfigure && (
              <div className="mt-2">
                <EditFlow flow={f} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function NewFlow() {
  return <FlowEditor trigger={<Button size="sm"><Plus size={15} /> New flow</Button>} />;
}

function EditFlow({ flow }: { flow: Flow }) {
  return (
    <FlowEditor
      flow={flow}
      trigger={
        <Button size="sm" variant="ghost">
          Edit
        </Button>
      }
    />
  );
}

function FlowEditor({ flow, trigger }: { flow?: Flow; trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(flow?.name ?? "");
  const [stages, setStages] = React.useState<StageEdit[]>(
    flow?.stages ?? [{ name: "Manager sign-off", roleGate: "manager" }],
  );
  const [pending, setPending] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={flow ? "Edit approval flow" : "New approval flow"}
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              loading={pending}
              onClick={async () => {
                setPending(true);
                const res = await saveApprovalFlowAction({ flowId: flow?.id, name: name || "Review flow", stages });
                setPending(false);
                toast({ title: res.ok ? res.message ?? "Saved" : "Failed", description: res.error, tone: res.ok ? "success" : "error" });
                if (res.ok) { setOpen(false); router.refresh(); }
              }}
            >
              Save flow
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Flow name" />
          {stages.map((s, i) => (
            <div key={i} className="space-y-1.5 rounded-[var(--radius-md)] border border-[var(--border)] p-2">
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-[13px] text-[var(--text-subtle)]">{i + 1}.</span>
                <Input
                  value={s.name}
                  onChange={(e) => setStages((st) => st.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  placeholder="Stage name"
                  className="min-w-0"
                />
                <Select
                  value={s.roleGate}
                  onChange={(e) => setStages((st) => st.map((x, j) => (j === i ? { ...x, roleGate: e.target.value } : x)))}
                  className="w-auto"
                >
                  {WORKSPACE_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </Select>
                <Button size="icon" variant="ghost" onClick={() => setStages((st) => st.filter((_, j) => j !== i))} aria-label="Remove stage">
                  <Trash2 size={13} />
                </Button>
              </div>
              <div className="flex items-center gap-2 pl-5 text-[12.5px] text-[var(--text-subtle)]">
                <span>SLA:</span>
                <Input
                  type="number"
                  min={0}
                  value={s.timeoutHours ?? ""}
                  onChange={(e) =>
                    setStages((st) => st.map((x, j) => (j === i ? { ...x, timeoutHours: e.target.value ? Number(e.target.value) : null } : x)))
                  }
                  placeholder="hours"
                  className="w-20"
                />
                {!!s.timeoutHours && (
                  <>
                    <span>then</span>
                    <Select
                      value={s.timeoutAction ?? "escalate"}
                      onChange={(e) => setStages((st) => st.map((x, j) => (j === i ? { ...x, timeoutAction: e.target.value } : x)))}
                      className="w-auto"
                    >
                      <option value="escalate">Escalate to role</option>
                      <option value="reject">Auto-reject</option>
                      <option value="auto_approve">Auto-approve</option>
                    </Select>
                    {s.timeoutAction === "escalate" && (
                      <Select
                        value={s.escalateToRole ?? ""}
                        onChange={(e) => setStages((st) => st.map((x, j) => (j === i ? { ...x, escalateToRole: e.target.value } : x)))}
                        className="w-auto"
                      >
                        <option value="">Pick a role…</option>
                        {WORKSPACE_ROLES.map((r) => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </Select>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
          <Button size="sm" variant="secondary" onClick={() => setStages((st) => [...st, { name: "Stage", roleGate: "editor" }])}>
            <Plus size={13} /> Add stage
          </Button>
        </div>
      </Modal>
    </>
  );
}

// NOTE: export as separate named components. A namespace object of client
// components ({ Queue, Flows }) does not survive property access across the
// RSC boundary — React throws "Element type is invalid".
export { Queue as ApprovalsQueue, Flows as ApprovalsFlows, NewFlow as ApprovalsNewFlow };
