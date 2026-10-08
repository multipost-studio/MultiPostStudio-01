"use client";

import * as React from "react";
import { ArrowUp, Loader2, Sparkles } from "lucide-react";
import { askMascotAction } from "@/app/actions/mascot";
import { STARTER_QUESTIONS } from "@/lib/mascot-brain/intents";
import type { MascotAnswer } from "@/lib/mascot-brain/types";
import { cn } from "@/lib/utils";

type Turn = { id: number; q: string; status: "pending" | "done" | "error"; answer?: MascotAnswer; error?: string };

const MAX = 200;
/** Below this the reply is shown as a guess, with "did you mean" chips. */
const SURE = 0.45;

/**
 * Ask-me-anything. Questions go to a server action that understands a fixed
 * vocabulary and answers from this workspace's live data; the reply cites real
 * numbers, links to real pages, and says plainly when it is not sure.
 */
export function AssistantAsk({
  recent,
  onAsked,
  go,
}: {
  recent: string[];
  onAsked: (q: string) => void;
  go: (href: string) => void;
}) {
  const [text, setText] = React.useState("");
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const nextId = React.useRef(1);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns]);

  const ask = React.useCallback(
    async (raw: string) => {
      const q = raw.replace(/\s+/g, " ").trim();
      if (!q) return;
      const id = nextId.current++;
      setText("");
      setTurns((t) => [...t.slice(-5), { id, q, status: "pending" }]);
      onAsked(q);
      const res = await askMascotAction(q);
      setTurns((t) => t.map((x) => (x.id === id ? (res.ok ? { ...x, status: "done", answer: res.answer } : { ...x, status: "error", error: res.error }) : x)));
    },
    [onAsked],
  );

  const chips = turns.length === 0 ? [...recent.slice(0, 2), ...STARTER_QUESTIONS.filter((s) => !recent.includes(s))].slice(0, 5) : [];
  const busy = turns.some((t) => t.status === "pending");

  return (
    <div className="flex min-h-0 flex-col">
      <div className="max-h-[min(40dvh,300px)] min-h-[120px] space-y-3 overflow-y-auto px-3 py-3" aria-live="polite" aria-relevant="additions">
        {turns.length === 0 && (
          <div className="px-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
            <p className="flex items-center gap-1.5 font-semibold text-[var(--text)]"><Sparkles size={14} aria-hidden className="text-[var(--primary)]" /> Ask about your workspace</p>
            <p className="mt-1">I read your live schedule, queue and accounts, so answers are real numbers. I can also show you how to do things or open any page.</p>
          </div>
        )}
        {turns.map((t) => (
          <div key={t.id} className="space-y-2">
            <p className="ml-auto w-fit max-w-[88%] rounded-[var(--radius)] rounded-br-sm bg-[var(--primary)] px-3 py-1.5 text-[13.5px] font-medium text-[var(--primary-text)]">{t.q}</p>
            {t.status === "pending" && (
              <p className="flex items-center gap-2 px-1 text-[13px] text-[var(--text-subtle)]"><Loader2 size={13} className="animate-spin" aria-hidden /> Looking that up…</p>
            )}
            {t.status === "error" && <p className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3 py-2 text-[13px] text-[var(--danger)]">{t.error}</p>}
            {t.status === "done" && t.answer && <AnswerCard answer={t.answer} go={go} onFollowUp={ask} disabled={busy} />}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2">
          {chips.map((c) => (
            <button key={c} type="button" onClick={() => void ask(c)} className="rounded-full border border-[var(--border-strong)] px-2.5 py-1 text-[12.5px] text-[var(--text-muted)] transition-colors hover:border-[var(--primary)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]">
              {c}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(text);
        }}
        className="flex items-center gap-2 border-t border-[var(--border)] p-2.5"
      >
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX))}
          placeholder="Ask anything…"
          aria-label="Ask the assistant"
          maxLength={MAX}
          autoComplete="off"
          className="h-9 min-w-0 flex-1 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--primary)]"
        />
        <button
          type="submit"
          disabled={!text.trim() || busy}
          aria-label="Send question"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-text)] transition-opacity disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
        >
          <ArrowUp size={16} aria-hidden />
        </button>
      </form>
    </div>
  );
}

function AnswerCard({ answer, go, onFollowUp, disabled }: { answer: MascotAnswer; go: (href: string) => void; onFollowUp: (q: string) => void; disabled: boolean }) {
  const unsure = answer.confidence < SURE;
  return (
    <div className="rounded-[var(--radius)] rounded-bl-sm border border-[var(--border)] bg-[var(--surface)] p-3">
      <p className="text-[14px] font-semibold leading-snug text-[var(--text)]">{answer.title}</p>
      {answer.lines.length > 0 && (
        <div className="mt-1 space-y-1">
          {answer.intent === "help" ? (
            <ol className="list-decimal space-y-0.5 pl-4 text-[13px] leading-snug text-[var(--text-muted)]">
              {answer.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ol>
          ) : (
            answer.lines.map((l) => (
              <p key={l} className="text-[13px] leading-snug text-[var(--text-muted)]">{l}</p>
            ))
          )}
        </div>
      )}
      {answer.items.length > 0 && (
        <ul className="mt-2 divide-y divide-[var(--border)] rounded-[var(--radius-sm)] border border-[var(--border)]">
          {answer.items.map((it) => (
            <li key={`${it.label}${it.sub ?? ""}`}>
              {it.href ? (
                <a href={it.href} onClick={(e) => { e.preventDefault(); go(it.href!); }} className="block px-2.5 py-1.5 hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]">
                  <span className="block truncate text-[13px] font-medium text-[var(--text)]">{it.label}</span>
                  {it.sub && <span className="block text-[12px] leading-snug text-[var(--text-muted)]">{it.sub}</span>}
                </a>
              ) : (
                <div className="px-2.5 py-1.5">
                  <span className="block truncate text-[13px] font-medium text-[var(--text)]">{it.label}</span>
                  {it.sub && <span className="block text-[12px] text-[var(--text-muted)]">{it.sub}</span>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {answer.actions.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {answer.actions.map((a, i) => (
            <a
              key={a.href}
              href={a.href}
              onClick={(e) => { e.preventDefault(); go(a.href); }}
              className={cn(
                "inline-flex items-center rounded-full px-3 py-1 text-[12.5px] font-semibold focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
                i === 0 ? "bg-[var(--primary)] text-[var(--primary-text)] hover:bg-[var(--primary-hover)]" : "border border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--surface-hover)]",
              )}
            >
              {a.label}
            </a>
          ))}
        </div>
      )}
      {answer.followUps.length > 0 && (
        <div className="mt-2.5">
          {unsure && <p className="mb-1 text-[12px] text-[var(--text-subtle)]">Did you mean:</p>}
          <div className="flex flex-wrap gap-1.5">
            {answer.followUps.map((q) => (
              <button key={q} type="button" disabled={disabled} onClick={() => onFollowUp(q)} className="rounded-full border border-[var(--border-strong)] px-2.5 py-1 text-[12px] text-[var(--text-muted)] transition-colors hover:border-[var(--primary)] hover:text-[var(--text)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[var(--ring)]">
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
