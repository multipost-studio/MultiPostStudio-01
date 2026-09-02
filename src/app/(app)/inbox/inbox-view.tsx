"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Send, StickyNote, Check, Archive, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea, Select } from "@/components/ui/input";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { PlatformBadge } from "@/components/brand";
import { useToast } from "@/components/ui/toast";
import { cn, relativeTime } from "@/lib/utils";
import {
  setConversationStatusAction,
  assignConversationAction,
  replyConversationAction,
  addConversationNoteAction,
  aiReplyAction,
} from "@/app/actions/inbox";

type Msg = { id: string; direction: string; authorName: string; body: string; createdAt: string };
type Conv = {
  id: string;
  platform: string;
  type: string;
  authorName: string;
  authorHandle: string;
  preview: string;
  status: string;
  sentiment: string | null;
  priority: number;
  rating: number | null;
  labels: string[];
  assignee: { id: string; name: string } | null;
  lastMessageAt: string;
  messages: Msg[];
};

const SENT_TONE: Record<string, "success" | "neutral" | "danger"> = {
  positive: "success",
  neutral: "neutral",
  negative: "danger",
};

export function InboxView({
  conversations,
  savedReplies,
  members,
}: {
  conversations: Conv[];
  savedReplies: { id: string; title: string; body: string }[];
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [filter, setFilter] = React.useState<string>("open");
  const [platform, setPlatform] = React.useState<string>("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);

  const filtered = conversations.filter(
    (c) =>
      (filter === "all" || (filter === "assigned" ? !!c.assignee : c.status === filter)) &&
      (!platform || c.platform === platform),
  );
  const selected = conversations.find((c) => c.id === selectedId) ?? filtered[0] ?? null;

  React.useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  async function act(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, label: string) {
    setBusy(label);
    const res = await fn();
    setBusy(null);
    if (res.ok) {
      if (res.message) toast({ title: res.message, tone: "success" });
      router.refresh();
    } else {
      toast({ title: "Failed", description: res.error, tone: "error" });
    }
  }

  const platforms = [...new Set(conversations.map((c) => c.platform))];

  return (
    <>
      <PageHeader
        title="Community Hub"
        description="Comments, mentions, DMs and reviews across every channel — one inbox."
      />

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {["open", "pending", "done", "assigned", "all"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[13px] font-medium capitalize",
              filter === f
                ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                : "border-[var(--border)] text-[var(--text-muted)]",
            )}
          >
            {f}
          </button>
        ))}
        <Select value={platform} onChange={(e) => setPlatform(e.target.value)} className="ml-auto h-8 w-auto text-[13px]">
          <option value="">All platforms</option>
          {platforms.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </Select>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* list */}
        <div className="max-h-[70vh] space-y-1.5 overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-2">
          {filtered.length === 0 && <p className="p-6 text-center text-[14px] text-[var(--text-muted)]">Nothing here.</p>}
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={cn(
                "w-full rounded-[var(--radius-md)] p-2.5 text-left transition-colors",
                selected?.id === c.id ? "bg-[var(--primary-soft)]/60" : "hover:bg-[var(--surface-hover)]",
              )}
            >
              <div className="flex items-center gap-2">
                <PlatformBadge platform={c.platform} size={16} />
                <span className="flex-1 truncate text-[14px] font-medium text-[var(--text)]">{c.authorName}</span>
                {c.priority >= 3 && <span className="h-1.5 w-1.5 rounded-full bg-[var(--danger)]" />}
                <span className="text-[11px] text-[var(--text-subtle)]">{relativeTime(c.lastMessageAt)}</span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-[13px] text-[var(--text-muted)]">{c.preview}</p>
              <div className="mt-1 flex items-center gap-1">
                <Badge tone="neutral">{c.type}</Badge>
                {c.sentiment && <Badge tone={SENT_TONE[c.sentiment]}>{c.sentiment}</Badge>}
                {c.assignee && <Badge tone="primary">{c.assignee.name.split(" ")[0]}</Badge>}
              </div>
            </button>
          ))}
        </div>

        {/* detail */}
        {!selected ? (
          <EmptyState title="Select a conversation" description="Pick a message on the left to view and respond." />
        ) : (
          <div className="flex flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] p-3">
              <Avatar name={selected.authorName} size={30} />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-[var(--text)]">{selected.authorName}</p>
                <p className="text-[12px] text-[var(--text-subtle)]">
                  {selected.authorHandle} · {selected.platform} · {selected.type}
                  {selected.rating != null && ` · ${selected.rating}★`}
                </p>
              </div>
              <Select
                value={selected.assignee?.id ?? ""}
                onChange={(e) => act(() => assignConversationAction(selected.id, e.target.value || null), "assign")}
                className="h-8 w-auto text-[13px]"
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </Select>
              <Button size="sm" variant="ghost" loading={busy === "done"} onClick={() => act(() => setConversationStatusAction(selected.id, selected.status === "done" ? "open" : "done"), "done")}>
                {selected.status === "done" ? <Archive size={13} /> : <Check size={13} />}
                {selected.status === "done" ? "Reopen" : "Mark done"}
              </Button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4" style={{ maxHeight: "45vh" }}>
              {selected.messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "max-w-[80%] rounded-[var(--radius-md)] p-2.5 text-[14px]",
                    m.direction === "outbound"
                      ? "ml-auto bg-[var(--primary)] text-white"
                      : m.direction === "note"
                        ? "border border-dashed border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--text)]"
                        : "bg-[var(--bg-sunken)] text-[var(--text)]",
                  )}
                >
                  {m.direction === "note" && (
                    <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-[var(--warning)]">
                      <StickyNote size={10} /> Internal note · {m.authorName}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p className={cn("mt-1 text-[11px]", m.direction === "outbound" ? "text-white/70" : "text-[var(--text-subtle)]")}>
                    {relativeTime(m.createdAt)}
                  </p>
                </div>
              ))}
            </div>

            <div className="border-t border-[var(--border)] p-3">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {(["draft", "shorter", "professional", "brand"] as const).map((mode) => (
                  <Button
                    key={mode}
                    size="sm"
                    variant="secondary"
                    loading={busy === `ai-${mode}`}
                    onClick={async () => {
                      setBusy(`ai-${mode}`);
                      const res = await aiReplyAction(selected.id, mode);
                      setBusy(null);
                      if (res.ok && typeof res.data === "string") setDraft(res.data);
                    }}
                  >
                    <Sparkles size={12} /> {mode === "draft" ? "AI reply" : mode}
                  </Button>
                ))}
                {savedReplies.length > 0 && (
                  <Select
                    onChange={(e) => {
                      const r = savedReplies.find((x) => x.id === e.target.value);
                      if (r) setDraft(r.body);
                    }}
                    className="h-8 w-auto text-[13px]"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Saved replies…
                    </option>
                    {savedReplies.map((r) => (
                      <option key={r.id} value={r.id}>{r.title}</option>
                    ))}
                  </Select>
                )}
              </div>
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a reply…" className="min-h-[70px]" />
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  loading={busy === "reply"}
                  disabled={!draft.trim()}
                  onClick={() => act(async () => {
                    const r = await replyConversationAction(selected.id, draft);
                    if (r.ok) setDraft("");
                    return r;
                  }, "reply")}
                >
                  <Send size={13} /> Send reply
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!draft.trim()}
                  loading={busy === "note"}
                  onClick={() => act(async () => {
                    const r = await addConversationNoteAction(selected.id, draft);
                    if (r.ok) setDraft("");
                    return r;
                  }, "note")}
                >
                  <StickyNote size={13} /> Add as note
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
