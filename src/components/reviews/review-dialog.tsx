"use client";

import * as React from "react";
import { ExternalLink, Heart, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  checkReviewPromptAction,
  declineReviewPromptAction,
  getMyReviewAction,
  markReviewPromptShownAction,
  removeMyReviewAction,
  snoozeReviewPromptAction,
  submitReviewAction,
  type MyReview,
  type SubmitResult,
} from "@/app/actions/reviews";
import { LIMITS } from "@/lib/reviews/model";
import { cn } from "@/lib/utils";

/** Fired from anywhere (the account menu) to open the review dialog on demand. */
export const OPEN_REVIEW_EVENT = "mps:open-review";

const SESSION_KEY = "mps_review_checked";
const WORDS = ["", "Poor", "Fair", "Good", "Great", "Excellent"];
const SPARKS = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2;
  const r = 70 + (i % 3) * 22;
  return { dx: Math.round(Math.cos(a) * r), dy: Math.round(Math.sin(a) * r), color: ["#f5a623", "#f0762e", "#e0528a", "#4f7cf0", "#2fa57a"][i % 5], delay: (i % 4) * 40 };
});

export type Mode = "prompt" | "manual";
export type Draft = { rating: number; title: string; body: string; displayName: string; role: string; publicConsent: boolean };
type Done = Extract<SubmitResult, { ok: true }>;

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = React.useState(0);
  const shown = hover || value;
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange(Math.min(5, (value || 0) + 1));
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange(Math.max(1, (value || 2) - 1));
    else return;
    e.preventDefault();
  }
  return (
    <div>
      <div role="radiogroup" aria-label="Your rating" onKeyDown={onKey} onMouseLeave={() => setHover(0)} className="flex justify-center gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}, ${WORDS[n]}`}
            tabIndex={value === n || (value === 0 && n === 1) ? 0 : -1}
            data-on={shown >= n}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(0)}
            onClick={() => onChange(n)}
            className={cn("mps-star-btn rounded-full p-1 focus-visible:outline-2 focus-visible:outline-[var(--ring)]", shown >= n ? "text-[#f5a623]" : "text-[var(--border-strong)]")}
          >
            <Star size={34} fill="currentColor" strokeWidth={1.5} aria-hidden />
          </button>
        ))}
      </div>
      <p className="mt-1 h-5 text-center text-[13.5px] font-semibold text-[var(--text-muted)]" aria-live="polite">
        {WORDS[shown]}
      </p>
    </div>
  );
}

function Thanks({ done, onClose }: { done: Done; onClose: () => void }) {
  return (
    <div className="px-1 py-4 text-center">
      <div className="mps-thanks-burst mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
        {SPARKS.map((s, i) => (
          <i key={i} aria-hidden style={{ background: s.color, animationDelay: `${s.delay}ms`, ["--dx" as string]: `${s.dx}px`, ["--dy" as string]: `${s.dy}px` }} />
        ))}
        <Heart size={30} fill="currentColor" aria-hidden />
      </div>
      <h3 className="mt-4 text-[20px] font-bold text-[var(--text)]">{done.thanks.title}</h3>
      <p className="mx-auto mt-1.5 max-w-sm text-[14.5px] leading-relaxed text-[var(--text-muted)]">{done.thanks.body}</p>
      <p className="mx-auto mt-3 max-w-sm rounded-[12px] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text-muted)]">
        {done.visibility === "published"
          ? "Your review is live on the site."
          : done.visibility === "queued"
            ? "We'll publish it after a quick check for spam."
            : "Kept private: it goes straight to the team."}
      </p>
      {done.externalLinks.length > 0 && (
        <div className="mt-4">
          <p className="text-[13px] font-medium text-[var(--text-muted)]">Happy to share it elsewhere too?</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {done.externalLinks.map((l) => (
              <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-3.5 py-2 text-[13.5px] font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]">
                {l.label} <ExternalLink size={13} aria-hidden />
              </a>
            ))}
          </div>
        </div>
      )}
      <Button className="mt-6" onClick={onClose}>
        Close
      </Button>
    </div>
  );
}

/** What the dialog needs from the outside. Injected so it can be shown and tested without a server. */
export type ReviewDialogApi = {
  submit: (input: Draft) => Promise<SubmitResult>;
  remove: () => Promise<{ ok: boolean; error?: string }>;
};

export function ReviewDialog({
  open,
  mode,
  existing,
  defaults,
  api,
  onClose,
  onDismiss,
  onDecline,
  onRemoved,
}: {
  open: boolean;
  mode: Mode;
  existing: MyReview | null;
  defaults: { displayName: string; role: string };
  api: ReviewDialogApi;
  /** Close after the thank-you screen. */
  onClose: () => void;
  /** Close without answering ("later"). */
  onDismiss: () => void;
  onDecline: () => void;
  onRemoved: () => void;
}) {
  const [draft, setDraft] = React.useState<Draft>({ rating: 0, title: "", body: "", displayName: "", role: "", publicConsent: false });
  const [errors, setErrors] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState<null | "send" | "remove">(null);
  const [done, setDone] = React.useState<Done | null>(null);
  const [confirmRemove, setConfirmRemove] = React.useState(false);

  // Each time it opens, start from what they wrote before, or from sensible defaults.
  React.useEffect(() => {
    if (!open) return;
    setDone(null);
    setErrors([]);
    setConfirmRemove(false);
    setDraft(
      existing
        ? { rating: existing.rating, title: existing.title, body: existing.body, displayName: existing.displayName, role: existing.role, publicConsent: existing.publicConsent }
        : { rating: 0, title: "", body: "", displayName: defaults.displayName, role: defaults.role, publicConsent: false },
    );
  }, [open, existing, defaults.displayName, defaults.role]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function send() {
    setErrors([]);
    if (draft.rating < 1) return setErrors(["Choose a star rating first."]);
    setBusy("send");
    const res = await api.submit(draft);
    setBusy(null);
    if (res.ok) setDone(res);
    else setErrors(res.errors);
  }

  async function remove() {
    setBusy("remove");
    const res = await api.remove();
    setBusy(null);
    if (res.ok) onRemoved();
    else setErrors([res.error ?? "Couldn't remove your review."]);
  }

  const status = existing?.status;
  const statusNote = !existing
    ? null
    : !existing.publicConsent
      ? "Private feedback: only the team can see it."
      : status === "approved"
        ? "Published on the site."
        : status === "rejected"
          ? "This review wasn't published."
          : "Waiting for a quick check before it goes live. Editing it keeps it in the queue.";

  return (
    <Modal
      open={open}
      onClose={done ? onClose : onDismiss}
      size="md"
      title={done ? "Review sent" : existing ? "Your review" : mode === "prompt" ? "Enjoying MultiPost Studio?" : "Review MultiPost Studio"}
      description={done ? undefined : mode === "prompt" ? "You've been publishing with us. A couple of honest lines help other teams and shape what we build next." : "Tell us how it's going. Honest is best."}
    >
      {done ? (
        <Thanks done={done} onClose={onClose} />
      ) : (
        <div className="space-y-4">
          <StarPicker value={draft.rating} onChange={(n) => set("rating", n)} />
          <Field label="Headline (optional)">
            <Input value={draft.title} maxLength={LIMITS.title} onChange={(e) => set("title", e.target.value)} placeholder="Sum it up in a few words" />
          </Field>
          <Field label="Your review" hint={`${draft.body.length}/${LIMITS.body}`}>
            <Textarea value={draft.body} maxLength={LIMITS.body} rows={4} onChange={(e) => set("body", e.target.value)} placeholder="What do you use it for? What works, and what could be better?" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name to show">
              <Input value={draft.displayName} maxLength={LIMITS.name} onChange={(e) => set("displayName", e.target.value)} />
            </Field>
            <Field label="Role or company (optional)">
              <Input value={draft.role} maxLength={LIMITS.role} onChange={(e) => set("role", e.target.value)} placeholder="Social lead, Acme" />
            </Field>
          </div>
          <Checkbox
            checked={draft.publicConsent}
            onCheckedChange={(v) => set("publicConsent", v)}
            label="Publish my review and name on the MultiPost Studio website"
            description="Optional. Leave this off and only our team sees it. You can edit or remove it any time from the account menu."
          />
          {statusNote && <p className="rounded-[12px] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text-muted)]">{statusNote}</p>}
          {errors.length > 0 && (
            <p role="alert" className="rounded-[12px] border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-[13.5px] text-[var(--danger)]">
              {errors[0]}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button onClick={() => void send()} loading={busy === "send"}>
              {existing ? "Update review" : "Send review"}
            </Button>
            {mode === "prompt" && !existing ? (
              <>
                <Button variant="ghost" onClick={onDismiss}>
                  Maybe later
                </Button>
                <button type="button" onClick={onDecline} className="ml-auto text-[13px] font-medium text-[var(--text-subtle)] underline-offset-2 hover:underline">
                  Don&apos;t ask again
                </button>
              </>
            ) : (
              existing && (
                <div className="ml-auto">
                  {confirmRemove ? (
                    <span className="inline-flex items-center gap-2 text-[13px]">
                      Remove it for good?
                      <Button size="sm" variant="destructive" loading={busy === "remove"} onClick={() => void remove()}>
                        Yes, remove
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                        Keep
                      </Button>
                    </span>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(true)}>
                      <Trash2 size={14} aria-hidden /> Remove my review
                    </Button>
                  )}
                </div>
              )
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

const REAL_API: ReviewDialogApi = {
  submit: (input) => submitReviewAction(input),
  remove: () => removeMyReviewAction(),
};

export function ReviewPrompt() {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<Mode>("manual");
  const [existing, setExisting] = React.useState<MyReview | null>(null);
  const [defaults, setDefaults] = React.useState({ displayName: "", role: "" });
  // True once the person has answered, so closing the thank-you screen isn't treated as "later".
  const answered = React.useRef(false);

  const show = React.useCallback((m: Mode, review: MyReview | null, d: { displayName: string; role: string }) => {
    answered.current = false;
    setMode(m);
    setExisting(review);
    setDefaults(d);
    setOpen(true);
  }, []);

  // The automatic ask: once per browser session, a little after the page settles, and never over another dialog.
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* storage blocked: still fine to ask once per page load */
    }
    const start = setTimeout(async () => {
      try {
        const check = await checkReviewPromptAction();
        if (cancelled || !check.ask) return;
        timer = setTimeout(() => {
          if (cancelled || document.hidden || document.querySelector('[role="dialog"]')) return;
          void markReviewPromptShownAction();
          show("prompt", null, check.defaults);
        }, check.delaySeconds * 1000);
      } catch {
        /* the popup is optional: never surface an error for it */
      }
    }, 2500);
    return () => {
      cancelled = true;
      clearTimeout(start);
      if (timer) clearTimeout(timer);
    };
  }, [show]);

  // Opened on request (account menu): load what they wrote before, if anything.
  React.useEffect(() => {
    async function onOpen() {
      try {
        const res = await getMyReviewAction();
        show("manual", res.review, res.defaults);
      } catch {
        toast({ title: "Couldn't open the review form", description: "Please try again in a moment.", tone: "error" });
      }
    }
    window.addEventListener(OPEN_REVIEW_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_REVIEW_EVENT, onOpen);
  }, [show, toast]);

  const api = React.useMemo<ReviewDialogApi>(
    () => ({
      ...REAL_API,
      submit: async (input) => {
        const res = await REAL_API.submit(input);
        if (res.ok) answered.current = true;
        return res;
      },
    }),
    [],
  );

  return (
    <ReviewDialog
      open={open}
      mode={mode}
      existing={existing}
      defaults={defaults}
      api={api}
      onClose={() => setOpen(false)}
      onDismiss={() => {
        // Closing the automatic popup without answering counts as "later".
        if (mode === "prompt" && !answered.current) void snoozeReviewPromptAction();
        setOpen(false);
      }}
      onDecline={() => {
        void declineReviewPromptAction();
        setOpen(false);
      }}
      onRemoved={() => {
        setOpen(false);
        toast({ title: "Your review was removed", tone: "success" });
      }}
    />
  );
}
