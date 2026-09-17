"use client";

import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { relativeTime } from "@/lib/utils";
import { getContactAction, saveContactAction } from "@/app/actions/contacts";

type History = { id: string; preview: string; status: string; lastMessageAt: string };

/**
 * CRM-lite contact profile: tags + notes persisted per (platform, handle),
 * plus their last few conversations in this workspace on that same
 * platform. Loaded fresh whenever the selected conversation's contact
 * changes — no cross-platform identity merging (see SocialContact's doc
 * comment on why that's deliberately not attempted).
 */
export function ContactCard({ platform, handle, displayName }: { platform: string; handle: string; displayName: string }) {
  const [open, setOpen] = React.useState(false);
  const [tags, setTags] = React.useState<string[]>([]);
  const [knownTags, setKnownTags] = React.useState<string[]>([]);
  const [notes, setNotes] = React.useState("");
  const [history, setHistory] = React.useState<History[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState(false);

  // Remounted by `key={platform:handle}` in the parent on contact switch, so
  // `loaded` already starts false for a new contact — no reset needed here.
  const reload = React.useCallback(async () => {
    setFailed(false);
    const res = await getContactAction(platform, handle);
    if (!res.ok || !res.data) {
      setFailed(true);
      return;
    }
    const d = res.data as { tags: string[]; notes: string; knownTags: readonly string[]; history: History[] };
    setTags(d.tags);
    setKnownTags([...d.knownTags]);
    setNotes(d.notes);
    setHistory(d.history);
    setLoaded(true);
  }, [platform, handle]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await reload();
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  async function save(nextTags: string[], nextNotes: string) {
    setSaving(true);
    setSaveError(false);
    const res = await saveContactAction({ platform, handle, displayName, tags: nextTags, notes: nextNotes });
    setSaving(false);
    if (!res.ok) setSaveError(true);
  }

  function toggleTag(tag: string) {
    const next = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
    setTags(next);
    void save(next, notes);
  }

  return (
    <div className="border-b border-[var(--border)]">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-[12.5px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
      >
        <span className="flex items-center gap-1.5">
          Contact profile
          {tags.map((t) => (
            <Badge key={t} tone={t === "Churn risk" ? "danger" : t === "VIP" ? "warning" : "info"}>
              {t}
            </Badge>
          ))}
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="space-y-3 px-3 pb-3">
          {failed ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12.5px] text-[var(--danger)]">Couldn&apos;t load the contact profile.</p>
              <button
                type="button"
                onClick={() => void reload()}
                className="shrink-0 text-[12.5px] font-medium text-[var(--primary)] hover:underline"
              >
                Retry
              </button>
            </div>
          ) : !loaded ? (
            <p className="text-[12.5px] text-[var(--text-subtle)]">Loading…</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Contact tags">
                {knownTags.map((t) => (
                  <button
                    key={t}
                    aria-pressed={tags.includes(t)}
                    onClick={() => toggleTag(t)}
                    className={`rounded-full border px-2 py-0.5 text-[11.5px] font-medium ${
                      tags.includes(t)
                        ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                        : "border-[var(--border)] text-[var(--text-muted)]"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => void save(tags, notes)}
                placeholder="Internal notes about this person…"
                aria-label={`Internal notes about ${displayName}`}
                className="min-h-[50px] text-[12.5px]"
              />
              {saving && <p className="text-[11px] text-[var(--text-subtle)]">Saving…</p>}
              {saveError && !saving && (
                <p role="alert" className="text-[11px] text-[var(--danger)]">
                  Couldn&apos;t save — your changes are kept here; try again.
                </p>
              )}

              {history.length > 0 && (
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">Past conversations</p>
                  <ul className="space-y-1">
                    {history.map((h) => (
                      <li key={h.id} className="truncate text-[12px] text-[var(--text-muted)]">
                        {h.preview} <span className="text-[var(--text-subtle)]">· {relativeTime(h.lastMessageAt)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
