"use client";

import * as React from "react";
import { ChevronDown, CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PlatformBadge } from "@/components/brand";
import { cn, relativeTime } from "@/lib/utils";
import type { ChannelCheck } from "@/lib/post-checks";
import { PLATFORM_LABELS, type FixPlan, type ReadinessState, type ValidationIssue } from "@/lib/platform-rules";

/**
 * Platform-aware status UI. Colour is never the only signal: every state has an
 * icon and a word, and the numbers are always printed.
 */

const STATE_STYLE: Record<ReadinessState, { text: string; chip: string; label: string }> = {
  ok: { text: "text-[var(--success)]", chip: "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]", label: "Ready" },
  warning: { text: "text-[var(--warning)]", chip: "border-[var(--warning)]/40 bg-[var(--warning-soft)] text-[var(--warning)]", label: "Recommendation" },
  error: { text: "text-[var(--danger)]", chip: "border-[var(--danger)]/40 bg-[var(--danger-soft)] text-[var(--danger)]", label: "Fix required" },
};

export function StateIcon({ state, size = 14 }: { state: ReadinessState; size?: number }) {
  if (state === "error") return <CircleAlert size={size} aria-hidden />;
  if (state === "warning") return <TriangleAlert size={size} aria-hidden />;
  return <CircleCheck size={size} aria-hidden />;
}

const n = (v: number) => v.toLocaleString("en-US");

/** "Instagram" for the platform, plus the channel name when it adds information ("Instagram · Cafe Main"). */
export function channelLabel(c: { platform: string; name: string }): string {
  const platform = PLATFORM_LABELS[c.platform] ?? c.platform;
  return c.name && c.name.toLowerCase() !== platform.toLowerCase() ? `${platform} · ${c.name}` : platform;
}

type Chip = { key: string; text: string; state: ReadinessState };

/** The counters for one channel: "1,842 / 2,200 characters", "4 / 5 hashtags". */
export function metricChips(check: ChannelCheck): Chip[] {
  const m = check.metrics;
  if (!m) return [];
  const chips: Chip[] = [];
  const issueState = (code: string): ReadinessState => {
    const i = check.issues.find((x) => x.code === code);
    return i ? (i.severity === "error" ? "error" : i.severity === "warning" ? "warning" : "ok") : "ok";
  };
  if (m.text) {
    chips.push({
      key: "text",
      text: m.text.limit != null ? `${n(m.text.count)} / ${n(m.text.limit)} ${m.text.unit}` : `${n(m.text.count)} ${m.text.unit}`,
      state: issueState("text.max"),
    });
  }
  if (m.title && m.title.limit != null) chips.push({ key: "title", text: `Title ${n(m.title.count)} / ${n(m.title.limit)}`, state: issueState("title.max") });
  if (m.description && m.description.limit != null) {
    chips.push({ key: "description", text: `${n(m.description.count)} / ${n(m.description.limit)} ${m.description.unit}`, state: issueState("description.max") });
  }
  if (m.topicTags && m.topicTags.limit != null) {
    chips.push({ key: "topic", text: `${m.topicTags.count} / ${m.topicTags.limit} topic tag${m.topicTags.limit === 1 ? "" : "s"}`, state: issueState("topicTags.max") });
  }
  if (m.hashtags) {
    const lim = m.hashtags.limit ?? m.hashtags.recommended;
    if (lim != null) {
      const st = m.hashtags.limit != null ? issueState("hashtags.max") : issueState("hashtags.recommendedMax");
      chips.push({ key: "hashtags", text: `${m.hashtags.count} / ${lim} hashtags${m.hashtags.limit == null ? " (suggested)" : ""}`, state: st });
    } else if (m.hashtags.count > 0) {
      chips.push({ key: "hashtags", text: `${m.hashtags.count} hashtags`, state: issueState("hashtags.ignoredAbove") });
    }
  }
  if (m.links && m.links.limit != null && m.links.count > 0) chips.push({ key: "links", text: `${m.links.count} / ${m.links.limit} links`, state: issueState("links.max") });
  if (m.mentions && m.mentions.limit != null && m.mentions.count > 0) chips.push({ key: "mentions", text: `${m.mentions.count} / ${m.mentions.limit} mentions`, state: issueState("mentions.max") });
  return chips;
}

export function MetricChips({ check, describedById }: { check: ChannelCheck; describedById?: string }) {
  const chips = metricChips(check);
  if (chips.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label={`${check.name} limits`} id={describedById}>
      {chips.map((c) => (
        <li
          key={c.key}
          className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-medium tabular-nums", STATE_STYLE[c.state].chip)}
        >
          <StateIcon state={c.state} size={12} />
          <span>{c.text}</span>
          <span className="sr-only">{c.state === "error" ? " — over the limit" : c.state === "warning" ? " — recommendation" : " — within the limit"}</span>
        </li>
      ))}
    </ul>
  );
}

/** Compact status shown under each selected channel chip. */
export function ChannelStatusLine({ check }: { check: ChannelCheck }) {
  const chips = metricChips(check);
  const worst = chips.find((c) => c.state === "error") ?? chips.find((c) => c.state === "warning") ?? chips[0];
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums", STATE_STYLE[check.state].text)}>
      <StateIcon state={check.state} size={11} />
      {worst ? worst.text.replace(/ characters| graphemes| bytes/, "") : STATE_STYLE[check.state].label}
    </span>
  );
}

function issueButtonLabel(i: ValidationIssue): string | null {
  if (i.fix?.type === "remove_hashtags") return "Review fix";
  return null;
}

export function ReadinessPanel({
  checks,
  onFocusChannel,
  onFix,
  validatedAt,
  onRecheck,
  rechecking,
}: {
  checks: ChannelCheck[];
  onFocusChannel: (channelId: string, field: ValidationIssue["field"]) => void;
  onFix: (channelId: string, issue: ValidationIssue) => void;
  /** When the post was last checked against the platform rules. */
  validatedAt?: Date;
  /** Re-run the server-side check (shown for drafts and scheduled posts). */
  onRecheck?: () => void;
  rechecking?: boolean;
}) {
  const [open, setOpen] = React.useState(true);
  const panelId = React.useId();
  if (checks.length === 0) return null;
  const ready = checks.filter((c) => c.state === "ok").length;
  const advice = checks.filter((c) => c.state === "warning").length;
  const blocked = checks.filter((c) => c.state === "error").length;
  const overall: ReadinessState = blocked ? "error" : advice ? "warning" : "ok";

  return (
    <section
      id="composer-errors"
      aria-label="Platform readiness"
      className={cn(
        "rounded-[var(--radius-lg)] border bg-[var(--surface)] shadow-sm",
        blocked ? "border-[var(--danger)]/40" : advice ? "border-[var(--warning)]/40" : "border-[var(--border)]",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left sm:cursor-default"
      >
        <span className="flex items-center gap-2 text-[14px] font-semibold text-[var(--text)]">
          <span className={STATE_STYLE[overall].text}>
            <StateIcon state={overall} size={16} />
          </span>
          Platform readiness
        </span>
        <span className="flex items-center gap-2 text-[12.5px] text-[var(--text-muted)]" role="status" aria-live="polite">
          {ready} ready{advice ? ` · ${advice} recommendation${advice === 1 ? "" : "s"}` : ""}
          {blocked ? ` · ${blocked} need${blocked === 1 ? "s" : ""} attention` : ""}
          <ChevronDown size={14} aria-hidden className={cn("transition-transform sm:hidden", open && "rotate-180")} />
        </span>
      </button>
      {(validatedAt || onRecheck) && (
        <div className={cn("flex items-center justify-between gap-2 border-t border-[var(--border)] px-3 py-1.5 text-[12px] text-[var(--text-subtle)]", open ? "flex" : "hidden sm:flex")}>
          <span>{validatedAt ? `Last validated: ${relativeTime(validatedAt)}` : ""}</span>
          {onRecheck && (
            <Button size="sm" variant="ghost" onClick={onRecheck} loading={rechecking}>
              Recheck
            </Button>
          )}
        </div>
      )}
      <ul id={panelId} className={cn("divide-y divide-[var(--border)] border-t border-[var(--border)]", open ? "block" : "hidden sm:block")}>
        {checks.map((c) => {
          const top = c.issues.find((i) => i.severity === "error") ?? c.issues.find((i) => i.severity === "warning");
          const extraErrors = c.errors.filter((e) => e !== top?.message);
          const fixable = c.issues.filter((i) => i.severity !== "info" && issueButtonLabel(i));
          return (
            <li key={c.channelId} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2">
              <span className="mt-0.5 shrink-0">
                <PlatformBadge platform={c.platform} size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("flex flex-wrap items-center gap-1.5 text-[13.5px] font-medium", STATE_STYLE[c.state].text)}>
                  <StateIcon state={c.state} />
                  <span className="text-[var(--text)]">{channelLabel(c)}</span>
                  <span>{STATE_STYLE[c.state].label}</span>
                </p>
                {top && <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{top.message}</p>}
                {extraErrors.map((e, i) => (
                  <p key={i} className="mt-0.5 text-[13px] text-[var(--text-muted)]">
                    {e}
                  </p>
                ))}
                {c.state !== "error" && c.notes.map((note, i) => (
                  <p key={i} className="mt-0.5 flex items-start gap-1 text-[12.5px] text-[var(--text-subtle)]">
                    <Info size={12} className="mt-0.5 shrink-0" aria-hidden />
                    {note}
                  </p>
                ))}
              </div>
              {(c.state === "error" || c.state === "warning") && (
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {fixable.slice(0, 1).map((i) => (
                    <Button key={i.code} size="sm" variant="secondary" onClick={() => onFix(c.channelId, i)}>
                      {issueButtonLabel(i)}
                    </Button>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => onFocusChannel(c.channelId, top?.field ?? "text")}>
                    Fix {PLATFORM_LABELS[c.platform] ?? c.name}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Shows exactly what an automatic fix will change. Nothing is applied until the user confirms. */
export function FixDialog({
  plan,
  platformName,
  onApply,
  onClose,
}: {
  plan: FixPlan | null;
  platformName: string;
  onApply: (plan: FixPlan) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={plan != null}
      onClose={onClose}
      title="Review changes"
      description={`For ${platformName}. Nothing changes until you apply.`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => plan && onApply(plan)}>
            Apply changes
          </Button>
        </>
      }
    >
      {plan && (
        <div className="space-y-3 text-[14px]">
          <p className="text-[var(--text)]">
            Remove {plan.removed.length} hashtag{plan.removed.length === 1 ? "" : "s"}
            {plan.field === "firstComment" ? " from the first comment" : plan.field === "both" ? " from the caption and first comment" : " from the caption"}:
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {plan.removed.map((t) => (
              <li key={t} className="rounded-full border border-[var(--danger)]/40 bg-[var(--danger-soft)] px-2 py-0.5 text-[13px] font-medium text-[var(--danger)] line-through">
                {t}
              </li>
            ))}
          </ul>
          <p className="text-[12.5px] text-[var(--text-subtle)]">The rest of your text stays exactly as it is. You can undo this with Ctrl/⌘+Z in the editor.</p>
        </div>
      )}
    </Modal>
  );
}

export type PublishKind = "schedule" | "queue" | "publish";

const KIND_COPY: Record<PublishKind, { title: string; partial: string; blocked: string }> = {
  publish: { title: "Publish now", partial: "Publish valid channels", blocked: "published" },
  schedule: { title: "Schedule", partial: "Schedule valid channels", blocked: "scheduled" },
  queue: { title: "Add to queue", partial: "Queue valid channels", blocked: "queued" },
};

/**
 * Shown instead of a generic error when some channels have hard errors. Lists
 * every channel and its problem, and offers to continue with only the valid
 * channels — never silently.
 */
export function PublishSummaryDialog({
  kind,
  checks,
  onFix,
  onPartial,
  onClose,
}: {
  kind: PublishKind | null;
  checks: ChannelCheck[];
  onFix: (channelId: string) => void;
  onPartial: (kind: PublishKind) => void;
  onClose: () => void;
}) {
  const valid = checks.filter((c) => c.valid);
  const invalid = checks.filter((c) => !c.valid);
  const copy = kind ? KIND_COPY[kind] : KIND_COPY.publish;
  return (
    <Modal
      open={kind != null}
      onClose={onClose}
      title={`${copy.title}: ${invalid.length} channel${invalid.length === 1 ? "" : "s"} need${invalid.length === 1 ? "s" : ""} attention`}
      description={`${valid.length} ready · ${invalid.length} need changes`}
      size="md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          {valid.length > 0 && kind && (
            <Button variant="secondary" size="sm" onClick={() => onPartial(kind)}>
              {copy.partial} ({valid.length})
            </Button>
          )}
          <Button size="sm" onClick={() => { onFix(invalid[0]?.channelId ?? ""); }}>
            Fix issues
          </Button>
        </>
      }
    >
      <ul className="space-y-2">
        {checks.map((c) => (
          <li key={c.channelId} className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--border)] p-2.5 text-[13.5px]">
            <span className={cn("mt-0.5", STATE_STYLE[c.valid ? (c.state === "warning" ? "warning" : "ok") : "error"].text)}>
              <StateIcon state={c.valid ? (c.state === "warning" ? "warning" : "ok") : "error"} size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 font-medium text-[var(--text)]">
                <PlatformBadge platform={c.platform} size={16} /> {channelLabel(c)}
                <span className="text-[12.5px] font-normal text-[var(--text-muted)]">{c.valid ? "Ready" : "Fix required"}</span>
              </p>
              {c.errors.map((e, i) => (
                <p key={i} className="mt-0.5 text-[var(--text-muted)]">
                  {e}
                </p>
              ))}
              {!c.valid && kind && <p className="mt-1 text-[12.5px] text-[var(--text-subtle)]">This channel will not be {copy.blocked} unless you fix it.</p>}
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
