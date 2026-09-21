"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Send,
  StickyNote,
  Check,
  Archive,
  ArrowLeft,
  Search,
  Flame,
  Smile,
  Meh,
  Frown,
  Tag,
  Plus,
  Trash2,
  Bookmark,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea, Select, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Avatar, EmptyState, InlineEmpty } from "@/components/ui/misc";
import { PlatformBadge } from "@/components/brand";
import { useToast } from "@/components/ui/toast";
import { cn, relativeTime } from "@/lib/utils";
import {
  setConversationStatusAction,
  assignConversationAction,
  replyConversationAction,
  addConversationNoteAction,
  aiReplyAction,
  setConversationPriorityAction,
  setConversationSentimentAction,
  setConversationLabelsAction,
  createSavedReplyAction,
  deleteSavedReplyAction,
} from "@/app/actions/inbox";
import {
  expandSavedReply,
  filterAndSortConversations,
  calculateInboxMetrics,
  type InboxSortOption,
} from "@/lib/community-inbox";
import { PresenceIndicator } from "./presence-indicator";
import { ContactCard } from "./contact-card";

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
  initialSelectedId,
}: {
  conversations: Conv[];
  savedReplies: { id: string; title: string; body: string }[];
  members: { id: string; name: string }[];
  initialSelectedId?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [filter, setFilter] = React.useState<string>("open");
  const [sentimentFilter, setSentimentFilter] = React.useState<string>("all");
  const [platform, setPlatform] = React.useState<string>("");
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [sortBy, setSortBy] = React.useState<InboxSortOption>("priority_desc");
  const [selectedId, setSelectedId] = React.useState<string | null>(initialSelectedId ?? null);
  const [mobilePane, setMobilePane] = React.useState<"list" | "detail">("list");
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);

  // Saved replies management modal state
  const [savedRepliesOpen, setSavedRepliesOpen] = React.useState(false);
  const [newReplyTitle, setNewReplyTitle] = React.useState("");
  const [newReplyBody, setNewReplyBody] = React.useState("");
  const [savingReply, setSavingReply] = React.useState(false);

  // New tag input state
  const [newTag, setNewTag] = React.useState("");

  const metrics = React.useMemo(() => calculateInboxMetrics(conversations), [conversations]);

  const filtered = React.useMemo(() => {
    return filterAndSortConversations(conversations, {
      status: filter,
      sentiment: sentimentFilter,
      platform,
      searchQuery,
      sort: sortBy,
    });
  }, [conversations, filter, sentimentFilter, platform, searchQuery, sortBy]);

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
        description="Comments, mentions, DMs and reviews across every channel — one prioritized inbox."
        actions={
          <Button size="sm" variant="secondary" onClick={() => setSavedRepliesOpen(true)}>
            <Bookmark size={13} /> Saved replies ({savedReplies.length})
          </Button>
        }
      />

      {/* Main Filter Bar */}
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1">
            {[
              { key: "open", label: `Open (${metrics.open})` },
              { key: "pending", label: `Pending (${metrics.pending})` },
              { key: "snoozed", label: `Snoozed (${metrics.snoozed})` },
              { key: "done", label: `Done (${metrics.done})` },
              { key: "assigned", label: "Assigned" },
              { key: "all", label: `All (${metrics.total})` },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={cn(
                  "inline-flex h-8 items-center rounded-full border px-3 text-[12.5px] font-medium transition-colors cursor-pointer",
                  filter === key
                    ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative ml-auto min-w-[200px] flex-1 sm:max-w-[260px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search author or message..."
              className="pl-8 text-[13px] h-8"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-subtle)] hover:text-[var(--text)]"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Secondary Bar: Sentiment Filter, Platform Filter, Sorting */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-2.5">
          <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
            <span className="text-[var(--text-subtle)] mr-1">Sentiment:</span>
            {[
              { key: "all", label: "All" },
              { key: "positive", label: `Positive (${metrics.positive})`, icon: Smile, color: "text-[var(--success)]" },
              { key: "neutral", label: `Neutral (${metrics.neutral})`, icon: Meh, color: "text-[var(--text-subtle)]" },
              { key: "negative", label: `Negative (${metrics.negative})`, icon: Frown, color: "text-[var(--danger)]" },
            ].map(({ key, label, icon: Icon, color }) => (
              <button
                key={key}
                onClick={() => setSentimentFilter(key)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-medium transition-colors cursor-pointer",
                  sentimentFilter === key
                    ? "bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text)] font-semibold"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]",
                )}
              >
                {Icon && <Icon size={12} className={color} />}
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              size="sm"
              className="w-auto text-[12px]"
            >
              <option value="">All platforms</option>
              {platforms.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>

            <Select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as InboxSortOption)}
              size="sm"
              className="w-auto text-[12px]"
            >
              <option value="priority_desc">Urgent & priority first</option>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Conversation List */}
        <div
          className={cn(
            "max-h-[70vh] space-y-1.5 overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-2",
            mobilePane === "detail" ? "hidden lg:block" : "block",
          )}
        >
          {filtered.length === 0 && (
            <InlineEmpty
              title="No conversations match"
              hint="Try adjusting your sentiment, status, or search filters."
            />
          )}
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setSelectedId(c.id);
                setMobilePane("detail");
              }}
              className={cn(
                "w-full rounded-[var(--radius-md)] p-2.5 text-left transition-colors cursor-pointer",
                selected?.id === c.id ? "bg-[var(--primary-soft)]/60 border border-[var(--primary)]/20" : "hover:bg-[var(--surface-hover)]",
              )}
            >
              <div className="flex items-center gap-2">
                <PlatformBadge platform={c.platform} size={16} />
                <span className="flex-1 truncate text-[14px] font-medium text-[var(--text)]">{c.authorName}</span>
                {c.priority >= 3 && (
                  <span className="inline-flex items-center text-[var(--danger)]" title="Urgent / High Priority">
                    <Flame size={12} />
                  </span>
                )}
                <span className="text-[11px] text-[var(--text-subtle)]">{relativeTime(c.lastMessageAt)}</span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-[13px] text-[var(--text-muted)]">{c.preview}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <Badge tone="neutral">{c.type}</Badge>
                {c.sentiment && <Badge tone={SENT_TONE[c.sentiment]}>{c.sentiment}</Badge>}
                {c.priority >= 2 && <Badge tone="warning">P{c.priority}</Badge>}
                {c.assignee && <Badge tone="primary">{c.assignee.name.split(" ")[0]}</Badge>}
                {c.labels.slice(0, 2).map((lbl, idx) => (
                  <span key={idx} className="rounded bg-[var(--bg-sunken)] px-1.5 py-0.5 text-[10.5px] text-[var(--text-subtle)]">
                    {lbl}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>

        {/* Conversation Detail */}
        {!selected ? (
          <div className={cn(mobilePane === "list" ? "hidden lg:block" : "block")}>
            <EmptyState title="Select a conversation" description="Pick a message on the left to view and respond." />
          </div>
        ) : (
          <div
            className={cn(
              "flex flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]",
              mobilePane === "list" ? "hidden lg:flex" : "flex",
            )}
          >
            {/* Detail Top Header */}
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] p-3">
              <Button
                size="sm"
                variant="ghost"
                className="lg:hidden -ml-1 mr-0.5 px-2 text-[13px]"
                onClick={() => setMobilePane("list")}
              >
                <ArrowLeft size={14} className="mr-1" /> Back
              </Button>
              <Avatar name={selected.authorName} size={30} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[14px] font-semibold text-[var(--text)]">{selected.authorName}</p>
                  <PlatformBadge platform={selected.platform} size={14} />
                </div>
                <p className="text-[12px] text-[var(--text-subtle)]">
                  {selected.authorHandle} · {selected.type}
                  {selected.rating != null && ` · ${selected.rating}★`}
                </p>
              </div>

              {/* Priority Selector */}
              <Select
                value={String(selected.priority)}
                onChange={(e) => act(() => setConversationPriorityAction(selected.id, Number(e.target.value)), "priority")}
                size="sm"
                className="w-auto text-[12px]"
                title="Set priority level"
              >
                <option value="0">Normal (P0)</option>
                <option value="2">Medium (P2)</option>
                <option value="3">High (P3)</option>
                <option value="4">Urgent (P4)</option>
              </Select>

              {/* Sentiment Selector */}
              <Select
                value={selected.sentiment ?? ""}
                onChange={(e) => act(() => setConversationSentimentAction(selected.id, e.target.value || null), "sentiment")}
                size="sm"
                className="w-auto text-[12px]"
                title="Classify sentiment"
              >
                <option value="">No sentiment</option>
                <option value="positive">Positive</option>
                <option value="neutral">Neutral</option>
                <option value="negative">Negative</option>
              </Select>

              {/* Assignee Selector */}
              <Select
                value={selected.assignee?.id ?? ""}
                onChange={(e) => act(() => assignConversationAction(selected.id, e.target.value || null), "assign")}
                size="sm"
                className="w-auto text-[12px]"
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </Select>

              {/* Status Action */}
              <Button
                size="sm"
                variant="ghost"
                loading={busy === "done"}
                onClick={() => act(() => setConversationStatusAction(selected.id, selected.status === "done" ? "open" : "done"), "done")}
              >
                {selected.status === "done" ? <Archive size={13} /> : <Check size={13} />}
                {selected.status === "done" ? "Reopen" : "Mark done"}
              </Button>
            </div>

            {/* Labels Bar */}
            <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border)] bg-[var(--bg-sunken)]/40 px-3 py-1.5 text-[12px]">
              <Tag size={12} className="text-[var(--text-subtle)] mr-0.5" />
              <span className="text-[var(--text-subtle)] text-[11px] font-medium">Tags:</span>
              {selected.labels.map((lbl, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--surface)] border border-[var(--border)] px-2 py-0.5 text-[11.5px] text-[var(--text)]"
                >
                  {lbl}
                  <button
                    type="button"
                    onClick={() => act(() => setConversationLabelsAction(selected.id, selected.labels.filter((_, i) => i !== idx)), "rm-tag")}
                    className="text-[var(--text-subtle)] hover:text-[var(--danger)] cursor-pointer"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
              <div className="flex items-center gap-1">
                <input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newTag.trim()) {
                      e.preventDefault();
                      const clean = newTag.trim();
                      if (!selected.labels.includes(clean)) {
                        act(() => setConversationLabelsAction(selected.id, [...selected.labels, clean]), "add-tag");
                      }
                      setNewTag("");
                    }
                  }}
                  placeholder="+ Add tag..."
                  className="rounded px-1.5 py-0.5 text-[11.5px] bg-transparent border border-dashed border-[var(--border)] text-[var(--text)] w-20 focus:w-28 transition-all"
                />
              </div>
            </div>

            <ContactCard
              key={`${selected.platform}:${selected.authorHandle}`}
              platform={selected.platform}
              handle={selected.authorHandle}
              displayName={selected.authorName}
            />

            {/* Message Thread */}
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

            {/* Reply Controls */}
            <div className="border-t border-[var(--border)] p-3">
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
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
                      if (res.ok && typeof res.data === "string") {
                        setDraft(res.data);
                      } else {
                        toast({ title: "AI reply failed", description: res.error ?? "Try again in a moment.", tone: "error" });
                      }
                    }}
                  >
                    <Sparkles size={12} /> {mode === "draft" ? "AI reply" : mode}
                  </Button>
                ))}

                {savedReplies.length > 0 && (
                  <Select
                    onChange={(e) => {
                      const r = savedReplies.find((x) => x.id === e.target.value);
                      if (r) {
                        const expanded = expandSavedReply(r.body, {
                          authorName: selected.authorName,
                          authorHandle: selected.authorHandle,
                          platform: selected.platform,
                        });
                        setDraft(expanded);
                      }
                    }}
                    size="sm"
                    className="w-auto text-[12px]"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Insert saved reply…
                    </option>
                    {savedReplies.map((r) => (
                      <option key={r.id} value={r.id}>{r.title}</option>
                    ))}
                  </Select>
                )}
              </div>

              <PresenceIndicator key={selected.id} conversationId={selected.id} isTyping={draft.trim().length > 0} />
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write a reply or internal note…"
                className="min-h-[70px] text-[13.5px]"
              />
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

      {/* Saved Replies Management Modal */}
      <Modal
        open={savedRepliesOpen}
        onClose={() => setSavedRepliesOpen(false)}
        title="Saved Replies Manager"
        description="Create reusable response templates. Use variables: {{name}}, {{first_name}}, {{platform}}, {{handle}}, {{workspace}}."
        footer={
          <Button size="sm" variant="ghost" onClick={() => setSavedRepliesOpen(false)}>
            Done
          </Button>
        }
      >
        <div className="space-y-4">
          <form
            className="space-y-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-hover)] p-3"
            action={async (fd) => {
              setSavingReply(true);
              const res = await createSavedReplyAction(null, fd);
              setSavingReply(false);
              toast({ title: res.ok ? "Created" : "Failed", description: res.error, tone: res.ok ? "success" : "error" });
              if (res.ok) {
                setNewReplyTitle("");
                setNewReplyBody("");
                router.refresh();
              }
            }}
          >
            <p className="text-[13px] font-semibold text-[var(--text)]">Create new template</p>
            <Input
              name="title"
              value={newReplyTitle}
              onChange={(e) => setNewReplyTitle(e.target.value)}
              placeholder="Title (e.g. Thanks for Feedback)"
              required
              className="text-[13px]"
            />
            <Textarea
              name="body"
              value={newReplyBody}
              onChange={(e) => setNewReplyBody(e.target.value)}
              placeholder="Template text. e.g.: Hi {{name}}, thanks for reaching out on {{platform}}!"
              required
              className="min-h-[70px] text-[13px]"
            />
            <Button size="sm" type="submit" loading={savingReply} disabled={!newReplyTitle.trim() || !newReplyBody.trim()}>
              <Plus size={13} /> Save template
            </Button>
          </form>

          <div className="space-y-2">
            <p className="text-[13px] font-semibold text-[var(--text)]">Existing templates ({savedReplies.length})</p>
            {savedReplies.length === 0 ? (
              <p className="text-[13px] text-[var(--text-muted)]">No saved replies yet. Create your first one above.</p>
            ) : (
              <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                {savedReplies.map((r) => (
                  <div key={r.id} className="flex items-start justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] p-2 text-[13px]">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[var(--text)]">{r.title}</p>
                      <p className="text-[12px] text-[var(--text-muted)] line-clamp-2 mt-0.5">{r.body}</p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Delete saved reply"
                      onClick={async () => {
                        await deleteSavedReplyAction(r.id);
                        toast({ title: "Deleted", tone: "success" });
                        router.refresh();
                      }}
                    >
                      <Trash2 size={13} className="text-[var(--danger)]" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
