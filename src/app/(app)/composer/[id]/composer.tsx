"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Save, Sparkles, CalendarClock, ListPlus, Send, MoreHorizontal, History,
  MessageSquare, Copy, Archive, Trash2, CheckCheck, Image as ImageIcon, X, Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { UnsplashPicker } from "@/components/unsplash-picker";
import { uploadFiles } from "@/lib/upload-media";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Dropdown, MenuItem, MenuSeparator } from "@/components/ui/dropdown";
import { Switch, Checkbox } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";
import { StatusBadge } from "@/components/status-badge";
import { PlatformBadge } from "@/components/brand";
import { PostPreview } from "@/components/post-previews";
import {
  contentTypesFor,
  defaultContentType,
  contentSpec,
  validateChannel,
  type MediaInput,
} from "@/lib/social/capabilities";
import { cn, relativeTime } from "@/lib/utils";
import { PLATFORMS, AI_TONES, type PlatformKey } from "@/lib/constants";
import {
  savePostAction, runPredictionAction, schedulePostAction, scheduleRecurringAction, cancelRecurringSeriesAction, addToQueueAction,
  publishNowAction, unscheduleAction, duplicatePostAction, archivePostAction,
  deletePostAction, retryPublishAction, addPostCommentAction, resolveCommentAction,
  restoreVersionAction, toggleEvergreenAction,
} from "@/app/actions/posts";
import { requestApprovalAction } from "@/app/actions/approvals";
import { aiRewriteAction, aiHashtagsAction, aiRepurposeAction, aiGenerateCaptionsAction, aiAltTextAction } from "@/app/actions/ai";
import { updateAssetAction } from "@/app/actions/media";

type Ch = { channelId: string; platform: string; contentType: string; body: string; error?: string | null; publishedUrl?: string | null };
type PostData = {
  id: string;
  title: string;
  status: string;
  recurrence: string | null;
  firstComment: string;
  campaignId: string;
  pillarId: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  isEvergreen: boolean;
  scheduledAt: string | null;
  channels: Ch[];
  mediaIds: string[];
  tagIds: string[];
  prediction: {
    engagementScore: number; clarityScore: number; hookStrength: number; readability: number;
    ctaScore: number; brandVoiceScore: number; platformFitScore: number;
    recommendations: string[]; actualEngagementRate: number | null;
  } | null;
  versions: { id: string; version: number; note: string | null; author: string; createdAt: string }[];
  comments: { id: string; body: string; author: string; resolved: boolean; createdAt: string }[];
  approval: { id: string; status: string; currentStage: number; stages: string[] } | null;
};

export function Composer({
  post,
  channels,
  campaigns,
  pillars,
  tags,
  media,
  unsplashEnabled,
  canPublish,
  canApprove,
  bestTime,
}: {
  post: PostData;
  channels: { id: string; platform: string; name: string; handle: string }[];
  campaigns: { id: string; name: string }[];
  pillars: { id: string; name: string; color: string }[];
  tags: { id: string; name: string }[];
  media: {
    id: string;
    url: string;
    thumbUrl: string | null;
    kind: string;
    mimeType: string;
    filename: string;
    altText: string;
    width: number | null;
    height: number | null;
    durationSec: number | null;
  }[];
  unsplashEnabled?: boolean;
  canPublish: boolean;
  canApprove: boolean;
  bestTime?: { weekday: number; hour: number };
}) {
  const router = useRouter();
  const { toast } = useToast();

  const locked = ["published", "publishing", "awaiting_approval"].includes(post.status);

  const [title, setTitle] = React.useState(post.title);
  const [chBodies, setChBodies] = React.useState<Record<string, string>>(
    Object.fromEntries(post.channels.map((c) => [c.channelId, c.body])),
  );
  const [selected, setSelected] = React.useState<string[]>(post.channels.map((c) => c.channelId));
  const [chTypes, setChTypes] = React.useState<Record<string, string>>(
    Object.fromEntries(post.channels.map((c) => [c.channelId, c.contentType])),
  );
  const [activeTab, setActiveTab] = React.useState<string>(post.channels[0]?.channelId ?? "");
  const [firstComment, setFirstComment] = React.useState(post.firstComment);
  const [campaignId, setCampaignId] = React.useState(post.campaignId);
  const [pillarId, setPillarId] = React.useState(post.pillarId);
  const [tagIds, setTagIds] = React.useState<string[]>(post.tagIds);
  const [mediaIds, setMediaIds] = React.useState<string[]>(post.mediaIds);
  const [utm, setUtm] = React.useState({ source: post.utmSource, medium: post.utmMedium, campaign: post.utmCampaign });
  const [evergreen, setEvergreen] = React.useState(post.isEvergreen);
  const [sameForAll, setSameForAll] = React.useState(false);

  const [saving, setSaving] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  useUnsavedChanges(dirty);
  const [schedOpen, setSchedOpen] = React.useState(false);
  const [varsOpen, setVarsOpen] = React.useState(false);
  const [variations, setVariations] = React.useState<string[]>([]);
  const [varsFor, setVarsFor] = React.useState<string>("");
  const [mediaOpen, setMediaOpen] = React.useState(false);
  const [mediaTab, setMediaTab] = React.useState<"library" | "unsplash">("library");
  const [uploadingMedia, setUploadingMedia] = React.useState(false);
  const uploadRef = React.useRef<HTMLInputElement>(null);
  const [histOpen, setHistOpen] = React.useState(false);
  const [commentsOpen, setCommentsOpen] = React.useState(false);
  const [previewMode, setPreviewMode] = React.useState<"desktop" | "mobile">("desktop");
  const [when, setWhen] = React.useState(
    post.scheduledAt ? post.scheduledAt.slice(0, 16) : new Date(Date.now() + 3600_000).toISOString().slice(0, 16),
  );
  const [repeat, setRepeat] = React.useState<{ freq: "none" | "daily" | "weekly" | "monthly"; interval: number; occurrences: number }>({
    freq: "none",
    interval: 1,
    occurrences: 4,
  });

  const platformOf = React.useMemo(
    () => Object.fromEntries(channels.map((c) => [c.id, c.platform])),
    [channels],
  );

  function setBody(channelId: string, value: string) {
    setDirty(true);
    if (sameForAll) {
      setChBodies((prev) => Object.fromEntries(selected.map((id) => [id, value])));
    } else {
      setChBodies((prev) => ({ ...prev, [channelId]: value }));
    }
  }

  function toggleChannel(id: string) {
    setDirty(true);
    setSelected((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (!next.includes(activeTab)) setActiveTab(next[0] ?? "");
      if (!(id in chBodies)) setChBodies((b) => ({ ...b, [id]: sameForAll ? Object.values(b)[0] ?? "" : "" }));
      if (!(id in chTypes)) setChTypes((t) => ({ ...t, [id]: defaultContentType(platformOf[id]) }));
      return next;
    });
  }

  function setChType(id: string, type: string) {
    setDirty(true);
    setChTypes((t) => ({ ...t, [id]: type }));
  }

  async function save(note?: string): Promise<boolean> {
    setSaving(true);
    const res = await savePostAction({
      id: post.id,
      title,
      firstComment,
      campaignId,
      pillarId,
      utmSource: utm.source,
      utmMedium: utm.medium,
      utmCampaign: utm.campaign,
      isEvergreen: evergreen,
      channels: selected.map((id) => ({
        channelId: id,
        body: chBodies[id] ?? "",
        contentType: chTypes[id] ?? defaultContentType(platformOf[id]),
      })),
      mediaIds,
      tagIds,
    });
    setSaving(false);
    if (res.ok) {
      setDirty(false);
      if (note !== "silent") toast({ title: "Saved", tone: "success" });
      router.refresh();
      return true;
    }
    toast({ title: "Couldn't save", description: res.error, tone: "error" });
    return false;
  }

  async function guardedSaveThen(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, label: string) {
    setBusy(label);
    if (dirty) {
      const okSave = await save("silent");
      if (!okSave) {
        setBusy(null);
        return;
      }
    }
    const res = await fn();
    setBusy(null);
    if (res.ok) {
      toast({ title: res.message ?? "Done", tone: "success" });
      router.refresh();
      setSchedOpen(false);
    } else {
      toast({ title: "Action failed", description: res.error, tone: "error" });
    }
  }

  const selChannels = channels.filter((c) => selected.includes(c.id));
  const selMedia = mediaIds.map((id) => media.find((m) => m.id === id)).filter(Boolean) as typeof media;

  const aiError = (msg: string) => toast({ title: msg, tone: "error" });

  async function onComposerUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadingMedia(true);
    const { okCount, firstError, newIds } = await uploadFiles(Array.from(files));
    setUploadingMedia(false);
    if (uploadRef.current) uploadRef.current.value = "";
    toast({
      title: okCount > 0 ? `${okCount} file${okCount === 1 ? "" : "s"} uploaded` : "Upload failed",
      description: firstError,
      tone: okCount > 0 ? "success" : "error",
    });
    if (okCount > 0) {
      setMediaIds((ids) => [...new Set([...ids, ...newIds])]);
      setDirty(true);
      router.refresh();
    }
  }

  async function genVariations(channelId: string, source: string, platform: PlatformKey) {
    if (!source.trim()) return;
    setBusy("variations");
    const res = await aiGenerateCaptionsAction({ prompt: source, platform, tone: "Brand voice", count: 3 });
    setBusy(null);
    if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
      setVariations(res.data as string[]);
      setVarsFor(channelId);
      setVarsOpen(true);
    } else {
      aiError(res.ok ? "No variations returned" : res.error ?? "Variation generation failed");
    }
  }

  // Platform + content-type validation from the central capability layer —
  // exactly what the server re-checks in assertReady before publishing.
  const mediaInputs: MediaInput[] = selMedia.map((m) => ({
    kind: m.kind,
    mimeType: m.mimeType,
    width: m.width,
    height: m.height,
    durationSec: m.durationSec,
  }));
  const channelChecks = selChannels.map((c) => {
    const type = chTypes[c.id] ?? defaultContentType(c.platform);
    const body = sameForAll ? chBodies[selected[0]] ?? "" : chBodies[c.id] ?? "";
    const { errors, warnings } = validateChannel(c.platform, type, { body, media: mediaInputs });
    return { channel: c, type, errors, warnings };
  });
  const blockingErrors = channelChecks.flatMap((v) => v.errors.map((e) => `${v.channel.name}: ${e}`));
  const advisories = channelChecks.flatMap((v) => v.warnings.map((w) => `${v.channel.name}: ${w}`));
  const canSend = blockingErrors.length === 0 && selChannels.length > 0;

  async function adaptToAll(fromChannelId: string, source: string) {
    if (!source.trim()) return;
    setBusy("adapt");
    const targets = selChannels
      .filter((c) => c.id !== fromChannelId)
      .map((c) => c.platform as PlatformKey);
    const res = await aiRepurposeAction({ source, targets });
    setBusy(null);
    const map = res.ok ? (res.data as Record<string, string> | undefined) : undefined;
    if (!map || typeof map !== "object") {
      aiError(res.ok ? "Adaptation returned nothing" : res.error ?? "Adaptation failed");
      return;
    }
    // map is { platform: body } — apply to every other selected channel.
    setChBodies((prev) => {
      const next = { ...prev };
      for (const c of selChannels) {
        if (c.id === fromChannelId) continue;
        const adapted = map[c.platform];
        if (adapted) next[c.id] = adapted;
      }
      return next;
    });
    setDirty(true);
    toast({ title: `Adapted for ${targets.length} channel${targets.length === 1 ? "" : "s"}`, tone: "success" });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Link href="/composer" className="text-[14px] text-[var(--text-muted)] hover:underline">
            ← All posts
          </Link>
          <StatusBadge status={post.status} />
          {post.prediction && (
            <Badge tone={post.prediction.engagementScore >= 70 ? "success" : post.prediction.engagementScore >= 50 ? "warning" : "danger"}>
              AI score {post.prediction.engagementScore}
            </Badge>
          )}
          {evergreen && <Badge tone="info">Evergreen</Badge>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!locked && (
            <Button size="sm" variant="secondary" onClick={() => save()} loading={saving}>
              <Save size={14} /> Save
            </Button>
          )}
          {!locked && (
            <Button size="sm" variant="secondary" onClick={() => guardedSaveThen(() => runPredictionAction(post.id), "predict")} loading={busy === "predict"}>
              <Sparkles size={14} /> Predict
            </Button>
          )}
          {post.status === "failed" && canPublish && (
            <Button size="sm" onClick={() => guardedSaveThen(() => retryPublishAction(post.id), "retry")} loading={busy === "retry"}>
              Retry publish
            </Button>
          )}
          {!locked && canPublish && (
            <>
              <Button size="sm" variant="secondary" disabled={!canSend} onClick={() => setSchedOpen(true)}>
                <CalendarClock size={14} /> Schedule
              </Button>
              <Button size="sm" variant="secondary" disabled={!canSend} onClick={() => guardedSaveThen(() => addToQueueAction(post.id), "queue")} loading={busy === "queue"}>
                <ListPlus size={14} /> Add to queue
              </Button>
              <Button size="sm" disabled={!canSend} onClick={() => guardedSaveThen(() => publishNowAction(post.id), "publish")} loading={busy === "publish"}>
                <Send size={14} /> Publish now
              </Button>
            </>
          )}
          {!locked && !canPublish && (
            <Button size="sm" disabled={!canSend} onClick={() => guardedSaveThen(() => requestApprovalAction(post.id), "approval")} loading={busy === "approval"}>
              <CheckCheck size={14} /> Request approval
            </Button>
          )}
          {post.status === "scheduled" && canPublish && (
            <Button size="sm" variant="ghost" onClick={() => guardedSaveThen(() => unscheduleAction(post.id), "unsched")} loading={busy === "unsched"}>
              Unschedule
            </Button>
          )}

          <Dropdown
            align="end"
            trigger={
              <Button size="icon" variant="ghost">
                <MoreHorizontal size={16} />
              </Button>
            }
          >
            <MenuItem onClick={() => setHistOpen(true)}>
              <History size={14} /> Version history ({post.versions.length})
            </MenuItem>
            <MenuItem onClick={() => setCommentsOpen(true)}>
              <MessageSquare size={14} /> Comments ({post.comments.length})
            </MenuItem>
            <MenuItem onClick={() => duplicatePostAction(post.id)}>
              <Copy size={14} /> Duplicate
            </MenuItem>
            <MenuSeparator />
            {!locked && (
              <MenuItem onClick={() => guardedSaveThen(() => archivePostAction(post.id), "archive")}>
                <Archive size={14} /> Archive
              </MenuItem>
            )}
            <MenuItem destructive onClick={() => deletePostAction(post.id)}>
              <Trash2 size={14} /> Delete
            </MenuItem>
          </Dropdown>
        </div>
      </div>

      {blockingErrors.length > 0 && (
        <div className="rounded-[var(--radius-md)] border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-[13px] text-[var(--danger)]">
          <p className="mb-1 font-medium">Fix before publishing:</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {blockingErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {blockingErrors.length === 0 && advisories.length > 0 && (
        <div className="rounded-[var(--radius-md)] border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 text-[13px] text-[var(--warning)]">
          <ul className="list-disc space-y-0.5 pl-4">
            {advisories.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {post.recurrence && (() => {
        let label = "recurring series";
        try {
          const r = JSON.parse(post.recurrence) as { freq?: string; interval?: number; occurrences?: number };
          if (r.freq) label = `repeats every ${r.interval ?? 1} ${r.freq === "daily" ? "day(s)" : r.freq === "weekly" ? "week(s)" : "month(s)"}${r.occurrences ? ` · ${r.occurrences} posts` : ""}`;
        } catch { /* ignore */ }
        return (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px]">
            <span className="text-[var(--text-muted)]">
              <span className="font-medium text-[var(--text)]">Part of a {label}.</span> Edits here don&apos;t change the other posts.
            </span>
            {canPublish && (
              <Button
                size="sm"
                variant="ghost"
                loading={busy === "cancelSeries"}
                onClick={() =>
                  guardedSaveThen(() => cancelRecurringSeriesAction(post.id), "cancelSeries")
                }
              >
                Cancel upcoming in series
              </Button>
            )}
          </div>
        );
      })()}

      {post.approval && post.approval.status !== "approved" && (
        <div className="rounded-[var(--radius-md)] border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 text-[14px] text-[var(--warning)]">
          In approval — stage {post.approval.currentStage + 1} of {post.approval.stages.length}:{" "}
          <span className="font-medium">{post.approval.stages[post.approval.currentStage]}</span>.{" "}
          <Link href="/approvals" className="underline">
            Open approvals
          </Link>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Editor */}
        <div className="space-y-4">
          <Field label="Internal title (optional)">
            <Input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} disabled={locked} placeholder="For your team — not published" />
          </Field>

          {/* Channels */}
          <div>
            <p className="mb-1.5 text-[14px] font-medium text-[var(--text)]">Channels</p>
            <div className="flex flex-wrap gap-2">
              {channels.length === 0 && (
                <Link href="/integrations" className="text-[14px] text-[var(--primary)] hover:underline">
                  Connect an account to start →
                </Link>
              )}
              {channels.map((c) => (
                <button
                  key={c.id}
                  disabled={locked}
                  onClick={() => toggleChannel(c.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] font-medium disabled:opacity-60",
                    selected.includes(c.id)
                      ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                      : "border-[var(--border)] text-[var(--text-muted)]",
                  )}
                >
                  <PlatformBadge platform={c.platform} size={16} />
                  {c.name}
                  {selected.includes(c.id) && (
                    <span className="rounded-full bg-[var(--primary)] px-1.5 text-[10px] font-semibold text-[var(--primary-text)]">
                      {contentSpec(c.platform, chTypes[c.id] ?? defaultContentType(c.platform))?.label ?? ""}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {selected.length > 0 && (
              <p className="mt-1.5 text-[12px] text-[var(--text-subtle)]">
                Pick a channel below to set its publish format and text.
              </p>
            )}
          </div>

          {selected.length > 1 && (
            <Checkbox checked={sameForAll} onCheckedChange={(v) => { setSameForAll(v); if (v) setBody(activeTab, chBodies[activeTab] ?? ""); }} label="Use the same text for every channel" />
          )}

          {selected.length > 0 && (
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
              {!sameForAll && selChannels.length > 1 && (
                <div className="flex gap-1 overflow-x-auto border-b border-[var(--border)] px-2 pt-2">
                  {selChannels.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setActiveTab(c.id)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-t-[var(--radius-sm)] border-b-2 px-2.5 py-1.5 text-[13px] font-medium",
                        activeTab === c.id ? "border-[var(--primary)] text-[var(--text)]" : "border-transparent text-[var(--text-muted)]",
                      )}
                    >
                      <PlatformBadge platform={c.platform} size={14} /> {PLATFORMS[c.platform as PlatformKey]?.label ?? c.platform}
                    </button>
                  ))}
                </div>
              )}
              {(() => {
                const editing = sameForAll ? selected[0] : activeTab;
                const plat = platformOf[editing] as PlatformKey;
                const editType = chTypes[editing] ?? defaultContentType(plat);
                const spec = contentSpec(plat, editType);
                const types = contentTypesFor(plat);
                const limit = spec?.charLimit ?? PLATFORMS[plat]?.limit ?? 5000;
                const val = chBodies[editing] ?? "";
                return (
                  <div className="p-3">
                    {types.length > 0 && (
                      <div className="mb-3">
                        <p className="mb-1.5 text-[13px] font-medium text-[var(--text)]">What do you want to publish?</p>
                        <div className="flex flex-wrap gap-1.5">
                          {types.map((t) => (
                            <button
                              key={t.type}
                              disabled={locked}
                              onClick={() => setChType(editing, t.type)}
                              className={cn(
                                "rounded-full border px-3 py-1 text-[13px] font-medium transition-colors",
                                editType === t.type
                                  ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                                  : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]",
                                t.publish === "unsupported" && "opacity-60",
                              )}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                        {spec?.note && (
                          <p className="mt-1.5 text-[12px] text-[var(--text-subtle)]">{spec.note}</p>
                        )}
                      </div>
                    )}
                    <Textarea
                      value={val}
                      disabled={locked}
                      onChange={(e) => setBody(editing, e.target.value)}
                      className="min-h-[180px] border-0 bg-transparent px-0 focus:ring-0"
                      placeholder="Write your post…"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <RewriteBtn label="Shorten" mode="shorten" text={val} platform={plat} onDone={(t) => setBody(editing, t)} onError={aiError} />
                        <RewriteBtn label="Expand" mode="expand" text={val} platform={plat} onDone={(t) => setBody(editing, t)} onError={aiError} />
                        <RewriteBtn label="Rephrase" mode="rephrase" text={val} platform={plat} onDone={(t) => setBody(editing, t)} onError={aiError} />
                        <ToneMenu text={val} platform={plat} onDone={(t) => setBody(editing, t)} onError={aiError} />
                        <button
                          disabled={!val.trim() || busy === "variations"}
                          onClick={() => genVariations(editing, val, plat)}
                          className="flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-[12px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-hover)] disabled:opacity-40"
                        >
                          <Wand2 size={11} /> {busy === "variations" ? "…" : "Variations"}
                        </button>
                        <button
                          onClick={async () => {
                            const res = await aiHashtagsAction(val.split(/\s+/).slice(0, 6).join(" ") || title);
                            if (res.ok && res.data) setBody(editing, `${val}\n\n${(res.data as string[]).join(" ")}`);
                            else if (!res.ok) aiError(res.error ?? "Hashtag generation failed");
                          }}
                          className="rounded-[var(--radius-sm)] px-2 py-1 text-[12px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
                        >
                          + Hashtags
                        </button>
                        {!sameForAll && selChannels.length > 1 && (
                          <button
                            disabled={!val.trim() || busy === "adapt"}
                            onClick={() => adaptToAll(editing, val)}
                            className="flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-[12px] font-medium text-[var(--primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40"
                          >
                            <Sparkles size={11} /> {busy === "adapt" ? "Adapting…" : "Adapt to all channels"}
                          </button>
                        )}
                      </div>
                      <span className={cn("text-[12px] tabular-nums", val.length > limit ? "font-medium text-[var(--danger)]" : "text-[var(--text-subtle)]")}>
                        {val.length}/{limit}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Media */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[14px] font-medium text-[var(--text)]">Media</p>
              {!locked && (
                <Button size="sm" variant="ghost" onClick={() => setMediaOpen(true)}>
                  <ImageIcon size={13} /> Add from library
                </Button>
              )}
            </div>
            {selMedia.length === 0 ? (
              <p className="text-[13px] text-[var(--text-subtle)]">No media attached.</p>
            ) : (
              <div className="space-y-2">
                {selMedia.map((m) => (
                  <MediaAltRow
                    key={m.id}
                    media={m}
                    postTitle={title}
                    locked={locked}
                    onRemove={() => { setMediaIds((ids) => ids.filter((x) => x !== m.id)); setDirty(true); }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="grid gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-2">
            <Field label="Campaign">
              <Select value={campaignId} disabled={locked} onChange={(e) => { setCampaignId(e.target.value); setDirty(true); }}>
                <option value="">None</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Content pillar">
              <Select value={pillarId} disabled={locked} onChange={(e) => { setPillarId(e.target.value); setDirty(true); }}>
                <option value="">None</option>
                {pillars.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="First comment" className="sm:col-span-2">
              <Textarea value={firstComment} disabled={locked} onChange={(e) => { setFirstComment(e.target.value); setDirty(true); }} placeholder="Auto-posted as the first comment where supported" className="min-h-[60px]" />
            </Field>
            <div className="sm:col-span-2">
              <p className="mb-1.5 text-[14px] font-medium text-[var(--text)]">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <button
                    key={t.id}
                    disabled={locked}
                    onClick={() => { setTagIds((ids) => ids.includes(t.id) ? ids.filter((x) => x !== t.id) : [...ids, t.id]); setDirty(true); }}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[12px] font-medium",
                      tagIds.includes(t.id) ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]" : "border-[var(--border)] text-[var(--text-muted)]",
                    )}
                  >
                    #{t.name}
                  </button>
                ))}
              </div>
            </div>
            <Field label="UTM source">
              <Input value={utm.source} disabled={locked} onChange={(e) => { setUtm({ ...utm, source: e.target.value }); setDirty(true); }} placeholder="instagram" />
            </Field>
            <Field label="UTM campaign">
              <Input value={utm.campaign} disabled={locked} onChange={(e) => { setUtm({ ...utm, campaign: e.target.value }); setDirty(true); }} placeholder="spring-launch" />
            </Field>
            <div className="sm:col-span-2">
              <Switch checked={evergreen} onCheckedChange={(v) => { setEvergreen(v); setDirty(true); toggleEvergreenAction(post.id, v); }} label="Mark as evergreen (eligible for recycling)" />
            </div>
          </div>
        </div>

        {/* Preview + prediction */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-medium text-[var(--text)]">Live preview</p>
            <div className="flex gap-1 rounded-[var(--radius-md)] bg-[var(--bg-sunken)] p-0.5 text-[12px]">
              {(["desktop", "mobile"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setPreviewMode(v)}
                  className={cn(
                    "rounded-[var(--radius-sm)] px-2 py-0.5 font-medium capitalize",
                    previewMode === v ? "bg-[var(--surface)] text-[var(--text)] shadow-sm" : "text-[var(--text-muted)]",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          {selChannels.length === 0 && <p className="text-[13px] text-[var(--text-subtle)]">Select a channel to preview.</p>}
          {selChannels.map((c) => (
            <div key={c.id} className={cn(previewMode === "mobile" && "mx-auto max-w-[340px]")}>
              <PostPreview
                platform={c.platform}
                contentType={chTypes[c.id] ?? defaultContentType(c.platform)}
                name={c.name}
                handle={c.handle}
                body={sameForAll ? chBodies[selected[0]] ?? "" : chBodies[c.id] ?? ""}
                media={selMedia.map((m) => ({
                  url: m.thumbUrl ?? m.url,
                  fullUrl: m.url,
                  kind: m.kind,
                  width: m.width,
                  height: m.height,
                }))}
              />
            </div>
          ))}

          {post.channels.some((c) => c.error) && (
            <div className="rounded-[var(--radius-md)] border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-[13px] text-[var(--danger)]">
              {post.channels.find((c) => c.error)?.error}
            </div>
          )}

          {post.prediction && (
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="mb-2 flex items-center gap-1.5 text-[14px] font-semibold text-[var(--text)]">
                <Sparkles size={14} className="text-[var(--primary)]" /> Performance prediction
              </p>
              <div className="grid grid-cols-2 gap-2 text-[13px]">
                {[
                  ["Engagement", post.prediction.engagementScore],
                  ["Hook strength", post.prediction.hookStrength],
                  ["Clarity", post.prediction.clarityScore],
                  ["Readability", post.prediction.readability],
                  ["CTA", post.prediction.ctaScore],
                  ["Brand voice", post.prediction.brandVoiceScore],
                  ["Platform fit", post.prediction.platformFitScore],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex items-center justify-between">
                    <span className="text-[var(--text-muted)]">{k}</span>
                    <span className={cn("font-semibold tabular-nums", (v as number) >= 70 ? "text-[var(--success)]" : (v as number) >= 50 ? "text-[var(--warning)]" : "text-[var(--danger)]")}>
                      {v as number}
                    </span>
                  </div>
                ))}
              </div>
              {post.prediction.actualEngagementRate != null && (
                <p className="mt-2 rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] p-2 text-[12px] text-[var(--text-muted)]">
                  Actual engagement rate after publishing: <span className="font-medium text-[var(--text)]">{post.prediction.actualEngagementRate}%</span>
                </p>
              )}
              <ul className="mt-2 space-y-1">
                {post.prediction.recommendations.map((r, i) => (
                  <li key={i} className="text-[13px] text-[var(--text-muted)]">• {r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Schedule modal */}
      <Modal
        open={schedOpen}
        onClose={() => setSchedOpen(false)}
        title="Schedule post"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setSchedOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              loading={busy === "sched"}
              onClick={() =>
                guardedSaveThen(
                  () =>
                    repeat.freq === "none"
                      ? schedulePostAction(post.id, new Date(when).toISOString())
                      : scheduleRecurringAction(post.id, new Date(when).toISOString(), {
                          freq: repeat.freq,
                          interval: repeat.interval,
                          occurrences: repeat.occurrences,
                        }),
                  "sched",
                )
              }
            >
              {repeat.freq === "none" ? "Schedule" : `Schedule ${repeat.occurrences} posts`}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="First publish date & time" hint="Uses your local time.">
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
          {bestTime && (
            <button
              type="button"
              onClick={() => {
                const d = new Date();
                d.setHours(bestTime.hour, 0, 0, 0);
                let add = (bestTime.weekday - d.getDay() + 7) % 7;
                if (add === 0 && d.getTime() <= Date.now()) add = 7;
                d.setDate(d.getDate() + add);
                setWhen(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
              }}
              className="text-[12px] font-medium text-[var(--primary)] hover:underline"
            >
              Use recommended time · {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][bestTime.weekday]} {bestTime.hour}:00
            </button>
          )}
          <Field label="Repeat">
            <Select value={repeat.freq} onChange={(e) => setRepeat({ ...repeat, freq: e.target.value as typeof repeat.freq })}>
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </Select>
          </Field>
          {repeat.freq !== "none" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Every N ${repeat.freq === "daily" ? "days" : repeat.freq === "weekly" ? "weeks" : "months"}`}>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={repeat.interval}
                  onChange={(e) => setRepeat({ ...repeat, interval: Math.max(1, Math.min(30, Number(e.target.value) || 1)) })}
                />
              </Field>
              <Field label="Total posts" hint="2–52">
                <Input
                  type="number"
                  min={2}
                  max={52}
                  value={repeat.occurrences}
                  onChange={(e) => setRepeat({ ...repeat, occurrences: Math.max(2, Math.min(52, Number(e.target.value) || 2)) })}
                />
              </Field>
            </div>
          )}
        </div>
      </Modal>

      {/* Variations */}
      <Modal open={varsOpen} onClose={() => setVarsOpen(false)} title="AI variations" description="Pick one to replace the current channel's text.">
        <div className="space-y-2">
          {variations.map((v, i) => (
            <button
              key={i}
              onClick={() => {
                setBody(varsFor || activeTab, v);
                setVarsOpen(false);
              }}
              className="w-full whitespace-pre-wrap rounded-[var(--radius-md)] border border-[var(--border)] p-3 text-left text-[13px] text-[var(--text)] hover:border-[var(--primary)]"
            >
              {v}
            </button>
          ))}
        </div>
      </Modal>

      {/* Media picker */}
      <Modal open={mediaOpen} onClose={() => setMediaOpen(false)} title="Media library" size="lg">
        <div className="mb-3 flex items-center justify-between gap-3">
          {unsplashEnabled ? (
            <div className="flex gap-1 rounded-[var(--radius-md)] bg-[var(--bg-sunken)] p-0.5 text-[13px]">
              {(["library", "unsplash"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setMediaTab(t)}
                  className={cn(
                    "rounded-[var(--radius-sm)] px-2.5 py-1 font-medium capitalize",
                    mediaTab === t ? "bg-[var(--surface)] text-[var(--text)] shadow-sm" : "text-[var(--text-muted)]",
                  )}
                >
                  {t === "library" ? "Your media" : "Unsplash"}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-[var(--text-muted)]">Pick from the library or upload a new file.</p>
          )}
          <input
            ref={uploadRef}
            type="file"
            multiple
            accept="image/*,video/*,.pdf"
            className="hidden"
            onChange={(e) => onComposerUpload(e.target.files)}
          />
          {mediaTab === "library" && (
            <Button size="sm" loading={uploadingMedia} onClick={() => uploadRef.current?.click()}>
              <ImageIcon size={13} /> Upload
            </Button>
          )}
        </div>

        {mediaTab === "unsplash" ? (
          <UnsplashPicker
            onImported={(id) => {
              setMediaIds((ids) => [...new Set([...ids, id])]);
              setDirty(true);
              router.refresh();
            }}
          />
        ) : media.length === 0 ? (
          <p className="text-[14px] text-[var(--text-muted)]">
            No media yet — hit <span className="font-medium text-[var(--text)]">Upload</span> above
            {unsplashEnabled ? ", try the Unsplash tab," : ""}, or add some in the{" "}
            <Link href="/media" className="text-[var(--primary)] underline">Media Library</Link>.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {media.map((m) => {
              const on = mediaIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => { setMediaIds((ids) => on ? ids.filter((x) => x !== m.id) : [...ids, m.id]); setDirty(true); }}
                  className={cn("relative overflow-hidden rounded-[var(--radius-md)] border-2", on ? "border-[var(--primary)]" : "border-transparent")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.thumbUrl ?? m.url} alt={m.filename} className="aspect-square w-full object-cover" />
                  {on && <span className="absolute right-1 top-1 rounded-full bg-[var(--primary)] p-0.5 text-white"><CheckCheck size={11} /></span>}
                </button>
              );
            })}
          </div>
        )}
      </Modal>

      {/* Version history */}
      <Modal open={histOpen} onClose={() => setHistOpen(false)} title="Version history" size="md">
        <ul className="space-y-2">
          {post.versions.length === 0 && <p className="text-[14px] text-[var(--text-muted)]">No saved versions yet.</p>}
          {post.versions.map((v) => (
            <li key={v.id} className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--border)] p-2.5">
              <div>
                <p className="text-[14px] font-medium text-[var(--text)]">v{v.version} · {v.note}</p>
                <p className="text-[12px] text-[var(--text-subtle)]">{v.author} · {relativeTime(v.createdAt)}</p>
              </div>
              {!locked && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const res = await restoreVersionAction(post.id, v.id);
                    if (res.ok) { toast({ title: res.message ?? "Restored", tone: "success" }); setHistOpen(false); router.refresh(); }
                  }}
                >
                  Restore
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Modal>

      {/* Comments */}
      <Modal open={commentsOpen} onClose={() => setCommentsOpen(false)} title="Team comments" size="md">
        <CommentThread postId={post.id} comments={post.comments} onChange={() => router.refresh()} />
      </Modal>
    </div>
  );
}

function MediaAltRow({
  media,
  postTitle,
  locked,
  onRemove,
}: {
  media: { id: string; url: string; thumbUrl: string | null; kind: string; filename: string; altText: string };
  postTitle: string;
  locked: boolean;
  onRemove: () => void;
}) {
  const { toast } = useToast();
  const [alt, setAlt] = React.useState(media.altText);
  const [busy, setBusy] = React.useState<"ai" | "save" | null>(null);

  return (
    <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--border)] p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={media.thumbUrl ?? media.url} alt="" className="h-14 w-14 shrink-0 rounded-[var(--radius-sm)] object-cover" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-[12px] text-[var(--text-subtle)]">{media.filename}</p>
        <div className="flex items-center gap-1.5">
          <input
            value={alt}
            disabled={locked}
            onChange={(e) => setAlt(e.target.value)}
            onBlur={async () => {
              if (alt === media.altText) return;
              setBusy("save");
              await updateAssetAction(media.id, { altText: alt });
              setBusy(null);
            }}
            placeholder="Alt text — describe the image for screen readers"
            className="h-8 flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 text-[12px]"
          />
          {media.kind === "image" && !locked && (
            <button
              disabled={busy !== null}
              onClick={async () => {
                setBusy("ai");
                const res = await aiAltTextAction({ filename: media.filename, context: postTitle });
                setBusy(null);
                if (res.ok && typeof res.data === "string") {
                  setAlt(res.data);
                  await updateAssetAction(media.id, { altText: res.data });
                } else if (!res.ok) {
                  toast({ title: res.error ?? "Alt text failed", tone: "error" });
                }
              }}
              className="flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1.5 text-[12px] font-medium text-[var(--primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40"
            >
              <Wand2 size={11} /> {busy === "ai" ? "…" : "AI"}
            </button>
          )}
        </div>
      </div>
      {!locked && (
        <button onClick={onRemove} className="shrink-0 rounded-full p-1 text-[var(--text-subtle)] hover:text-[var(--danger)]" aria-label="Remove">
          <X size={13} />
        </button>
      )}
    </div>
  );
}

function RewriteBtn({
  label, mode, text, platform, tone, onDone, onError,
}: {
  label: string;
  mode: "shorten" | "expand" | "tone" | "rephrase";
  text: string;
  platform: PlatformKey;
  tone?: string;
  onDone: (t: string) => void;
  onError?: (msg: string) => void;
}) {
  const [loading, setLoading] = React.useState(false);
  return (
    <button
      disabled={!text.trim() || loading}
      onClick={async () => {
        setLoading(true);
        const res = await aiRewriteAction({ text, mode, platform, tone });
        setLoading(false);
        if (res.ok && typeof res.data === "string") onDone(res.data);
        else if (!res.ok) onError?.(res.error ?? "AI rewrite failed");
      }}
      className="flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-[12px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-hover)] disabled:opacity-40"
    >
      <Wand2 size={11} /> {loading ? "…" : label}
    </button>
  );
}

function ToneMenu({ text, platform, onDone, onError }: { text: string; platform: PlatformKey; onDone: (t: string) => void; onError?: (m: string) => void }) {
  const [loading, setLoading] = React.useState(false);
  return (
    <Select
      value=""
      disabled={!text.trim() || loading}
      onChange={async (e) => {
        const tone = e.target.value;
        if (!tone) return;
        setLoading(true);
        const res = await aiRewriteAction({ text, mode: "tone", platform, tone });
        setLoading(false);
        e.target.value = "";
        if (res.ok && typeof res.data === "string") onDone(res.data);
        else if (!res.ok) onError?.(res.error ?? "AI rewrite failed");
      }}
      className="h-7 w-auto text-[12px]"
    >
      <option value="">{loading ? "…" : "Tone…"}</option>
      {AI_TONES.map((t) => (
        <option key={t} value={t}>{t}</option>
      ))}
    </Select>
  );
}

function CommentThread({
  postId, comments, onChange,
}: {
  postId: string;
  comments: PostData["comments"];
  onChange: () => void;
}) {
  const [text, setText] = React.useState("");
  const [pending, setPending] = React.useState(false);
  return (
    <div className="space-y-3">
      <ul className="max-h-[300px] space-y-2 overflow-y-auto">
        {comments.length === 0 && <p className="text-[14px] text-[var(--text-muted)]">No comments yet.</p>}
        {comments.map((c) => (
          <li key={c.id} className={cn("rounded-[var(--radius-md)] border border-[var(--border)] p-2.5", c.resolved && "opacity-60")}>
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold text-[var(--text)]">{c.author}</p>
              {!c.resolved && (
                <button onClick={async () => { await resolveCommentAction(c.id); onChange(); }} className="text-[12px] text-[var(--primary)] hover:underline">
                  Resolve
                </button>
              )}
            </div>
            <p className="text-[14px] text-[var(--text-muted)]">{c.body}</p>
            <p className="mt-0.5 text-[11px] text-[var(--text-subtle)]">{relativeTime(c.createdAt)}{c.resolved && " · resolved"}</p>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…" />
        <Button
          size="sm"
          loading={pending}
          onClick={async () => {
            setPending(true);
            const res = await addPostCommentAction(postId, text);
            setPending(false);
            if (res.ok) { setText(""); onChange(); }
          }}
        >
          Post
        </Button>
      </div>
    </div>
  );
}
