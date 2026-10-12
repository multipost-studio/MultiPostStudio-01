"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Save, Sparkles, CalendarClock, ListPlus, Send, MoreHorizontal, History,
  MessageSquare, Copy, Archive, Trash2, CheckCheck, Image as ImageIcon, X, Wand2, Crop,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { UnsplashPicker } from "@/components/unsplash-picker";
import { DrivePicker } from "@/components/drive-picker";
import { GooglePhotosPicker } from "@/components/google-photos-picker";
import { DropboxPicker } from "@/components/dropbox-picker";
import { OneDrivePicker } from "@/components/onedrive-picker";
import { CanvaDesignPicker } from "@/components/canva-design-picker";
import { uploadFiles } from "@/lib/upload-media";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { AppLoader } from "@/components/ui/app-loader";
import { Dropdown, MenuItem, MenuSeparator } from "@/components/ui/dropdown";
import { confirmDestructive } from "@/components/ui/confirm";
import { Switch } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";
import { StatusBadge } from "@/components/status-badge";
import { PlatformBadge } from "@/components/brand";
import { PostPreview } from "@/components/post-previews";
import { PreviewControls, type PreviewTheme, type PreviewViewMode } from "@/components/preview-controls";
import { MediaEditorModal, type EditableAsset } from "@/components/media-editor";
import { InlineEmpty } from "@/components/ui/misc";
import {
  contentTypesFor,
  defaultContentType,
  contentSpec,
  type MediaInput,
} from "@/lib/social/capabilities";
import { checkChannels, type ChannelCheck } from "@/lib/post-checks";
import {
  DEFAULT_RULESET,
  appendHashtag,
  findHashtags,
  planHashtagFix,
  planKeepFirst,
  proposeAdaptation,
  removeHashtag,
  removeSpans,
  uniqueHashtags,
  type AccountTier,
  type FixPlan,
  type RuleSet,
  type ValidationIssue,
} from "@/lib/platform-rules";
import {
  ChannelStatusLine,
  FixDialog,
  MetricChips,
  metricChips,
  PublishSummaryDialog,
  ReadinessPanel,
  type PublishKind,
} from "@/components/composer/platform-status";
import { HashtagManager } from "@/components/composer/hashtag-manager";
import { AdaptReviewDialog, type ChannelAdaptProposal } from "@/components/composer/adapt-review";
import { cn, relativeTime } from "@/lib/utils";
import { applyUtm } from "@/lib/utm";
import { describeInZone } from "@/lib/timezones";
import { fireConfetti } from "@/lib/confetti";
import { FileDropOverlay } from "@/components/ui/file-drop-overlay";
import { PLATFORMS, AI_TONES, type PlatformKey } from "@/lib/constants";
import {
  savePostAction, runPredictionAction, schedulePostAction, scheduleRecurringAction, cancelRecurringSeriesAction, addToQueueAction,
  publishNowAction, unscheduleAction, duplicatePostAction, archivePostAction,
  deletePostAction, retryPublishAction, addPostCommentAction, resolveCommentAction,
  restoreVersionAction, toggleEvergreenAction, recheckPostAction,
} from "@/app/actions/posts";
import { requestApprovalAction } from "@/app/actions/approvals";
import { aiRewriteAction, aiHashtagsAction, aiRepurposeAction, aiGenerateCaptionsAction, aiAltTextAction } from "@/app/actions/ai";
import { updateAssetAction } from "@/app/actions/media";
import { HashtagGroups } from "./hashtag-groups";
import { PinterestOptions } from "@/components/composer/pinterest-options";

type Ch = { channelId: string; platform: string; contentType: string; body: string; metadata?: string | null; error?: string | null; publishedUrl?: string | null };
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

/**
 * `<input type="datetime-local">` reads and writes LOCAL wall-clock time, so a
 * raw toISOString() (UTC) default was off by the viewer's UTC offset — 5.5h in
 * IST, for example. Shifting by the offset first keeps the field honest.
 */
function toLocalInput(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function Composer({
  post,
  channels,
  campaigns,
  pillars,
  tags,
  media,
  hashtagGroups,
  unsplashEnabled,
  driveEnabled,
  googlePhotosEnabled,
  googlePhotosConnected,
  dropboxEnabled,
  dropboxConnected,
  onedriveEnabled,
  onedriveConnected,
  canvaEnabled,
  canvaConnected,
  canPublish,
  canApprove,
  workspaceTimezone,
  bestTime,
  rules = DEFAULT_RULESET,
}: {
  post: PostData;
  channels: { id: string; platform: string; name: string; handle: string; accountId?: string; tier?: AccountTier }[];
  campaigns: { id: string; name: string }[];
  pillars: { id: string; name: string; color: string }[];
  tags: { id: string; name: string }[];
  hashtagGroups: { id: string; name: string; tags: string[] }[];
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
  driveEnabled?: boolean;
  googlePhotosEnabled?: boolean;
  googlePhotosConnected?: boolean;
  dropboxEnabled?: boolean;
  dropboxConnected?: boolean;
  onedriveEnabled?: boolean;
  onedriveConnected?: boolean;
  canvaEnabled?: boolean;
  canvaConnected?: boolean;
  canPublish: boolean;
  canApprove: boolean;
  /** The team's shared reference zone, if one is set. Display only. */
  workspaceTimezone?: string | null;
  bestTime?: { weekday: number; hour: number };
  /** Live platform rules (defaults + admin overrides), loaded on the server. */
  rules?: RuleSet;
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
  const [chMeta, setChMeta] = React.useState<Record<string, Record<string, string>>>(() => {
    const init: Record<string, Record<string, string>> = {};
    for (const c of post.channels) {
      if (c.metadata) {
        try {
          init[c.channelId] = JSON.parse(c.metadata);
        } catch {
          init[c.channelId] = {};
        }
      } else {
        init[c.channelId] = {};
      }
    }
    return init;
  });

  function updateChMeta(channelId: string, updates: Record<string, string>) {
    setDirty(true);
    setChMeta((prev) => ({
      ...prev,
      [channelId]: { ...(prev[channelId] ?? {}), ...updates },
    }));
  }
  const [saving, setSaving] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  useUnsavedChanges(dirty);
  const [schedOpen, setSchedOpen] = React.useState(false);
  const [varsOpen, setVarsOpen] = React.useState(false);
  const [variations, setVariations] = React.useState<string[]>([]);
  const [varsFor, setVarsFor] = React.useState<string>("");
  const [mediaOpen, setMediaOpen] = React.useState(false);
  const [mediaTab, setMediaTab] = React.useState<"library" | "unsplash" | "drive" | "photos" | "dropbox" | "onedrive" | "canva">("library");
  const [uploadingMedia, setUploadingMedia] = React.useState(false);
  const uploadRef = React.useRef<HTMLInputElement>(null);
  const [histOpen, setHistOpen] = React.useState(false);
  const [commentsOpen, setCommentsOpen] = React.useState(false);
  const [previewMode, setPreviewMode] = React.useState<"desktop" | "mobile">("desktop");
  const [previewTheme, setPreviewTheme] = React.useState<PreviewTheme>("light");
  const [showSafeZone, setShowSafeZone] = React.useState(false);
  const [previewViewMode, setPreviewViewMode] = React.useState<PreviewViewMode>("single");
  const [editingAsset, setEditingAsset] = React.useState<EditableAsset | null>(null);
  const [mobilePane, setMobilePane] = React.useState<"edit" | "preview">("edit");
  const [when, setWhen] = React.useState(
    // scheduledAt arrives as a UTC ISO string; slicing it fed UTC straight into
    // a local-time field, so an existing schedule displayed (and re-saved)
    // shifted by the viewer's UTC offset — 5h30m in IST.
    post.scheduledAt
      ? toLocalInput(new Date(post.scheduledAt))
      : toLocalInput(new Date(Date.now() + 3600_000)),
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
        metadata: chMeta[id] ? JSON.stringify(chMeta[id]) : undefined,
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
      // Publishing live is the one milestone here worth a celebration; saves and schedules are not.
      if (label === "publish") fireConfetti();
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
  // One shared validator (same code the server runs before publishing). The
  // live readout follows a deferred copy of the text so typing stays instant.
  const bodyFor = (id: string, bodies: Record<string, string>) => (sameForAll ? bodies[selected[0]] ?? "" : bodies[id] ?? "");
  const computeCheck = (bodies: Record<string, string>, comment: string) =>
    checkChannels({
      rules,
      media: mediaInputs,
      firstComment: comment,
      channels: selChannels.map((c) => ({
        channelId: c.id,
        name: c.name,
        platform: c.platform,
        contentType: chTypes[c.id] ?? defaultContentType(c.platform),
        body: bodyFor(c.id, bodies),
        metadata: chMeta[c.id] ? JSON.stringify(chMeta[c.id]) : undefined,
        tier: c.tier,
      })),
    });
  const deferredBodies = React.useDeferredValue(chBodies);
  const deferredComment = React.useDeferredValue(firstComment);
  const postCheck = computeCheck(deferredBodies, deferredComment);
  const checkFor = (id: string): ChannelCheck | undefined => postCheck.channels.find((c) => c.channelId === id);
  const blockingErrors = postCheck.channels.flatMap((c) => c.errors.map((e) => `${c.name}: ${e}`));
  const canSend = postCheck.invalidCount === 0 && selChannels.length > 0;
  const needsAttention = selChannels.length > 0 && postCheck.invalidCount > 0;

  const [summaryKind, setSummaryKind] = React.useState<PublishKind | null>(null);
  const [partialSched, setPartialSched] = React.useState(false);
  const [fixState, setFixState] = React.useState<{ plan: FixPlan; channelId: string } | null>(null);
  const [adaptProposals, setAdaptProposals] = React.useState<ChannelAdaptProposal[] | null>(null);
  const [validatedAt, setValidatedAt] = React.useState<Date>(() => new Date());

  /** Schedule / queue / publish: validate the freshest text first; if anything blocks, explain per channel instead of a generic error. */
  function attempt(kind: PublishKind) {
    if (computeCheck(chBodies, firstComment).invalidCount > 0) {
      setSummaryKind(kind);
      return;
    }
    proceed(kind, false);
  }

  function proceed(kind: PublishKind, partial: boolean) {
    const opts = partial ? { publishValidOnly: true } : undefined;
    setSummaryKind(null);
    if (kind === "schedule") {
      setPartialSched(partial);
      setWhenIsPast(isPast(when));
      setSchedOpen(true);
    } else if (kind === "queue") {
      void guardedSaveThen(() => addToQueueAction(post.id, opts), "queue");
    } else {
      void guardedSaveThen(() => publishNowAction(post.id, opts), "publish");
    }
  }

  function focusChannel(channelId: string, field: ValidationIssue["field"]) {
    setSummaryKind(null);
    if (channelId && !sameForAll) setActiveTab(channelId);
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => {
      const el = document.getElementById(field === "firstComment" ? "composer-first-comment" : "composer-body");
      el?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
      el?.focus({ preventScroll: true });
    }, 60);
  }

  /** Plan a hashtag fix from the freshest text, and show it for confirmation. Nothing changes yet. */
  function startFix(channelId: string, issue: ValidationIssue) {
    const fresh = computeCheck(chBodies, firstComment).channels.find((c) => c.channelId === channelId);
    const freshIssue = fresh?.issues.find((i) => i.code === issue.code) ?? issue;
    const plan = planHashtagFix(freshIssue, { body: bodyFor(channelId, chBodies), firstComment });
    if (!plan) {
      focusChannel(channelId, issue.field);
      return;
    }
    setFixState({ plan, channelId });
  }

  function applyFix(plan: FixPlan, channelId: string) {
    if (plan.body !== bodyFor(channelId, chBodies)) setBody(channelId, plan.body);
    if (plan.firstComment !== firstComment) {
      setFirstComment(plan.firstComment);
      setDirty(true);
    }
    setFixState(null);
    toast({ title: `Removed ${plan.removed.length} hashtag${plan.removed.length === 1 ? "" : "s"}`, description: plan.removed.join(" "), tone: "success" });
  }

  /** How many more hashtags every selected platform can take (Infinity = no hard limit). */
  function hashtagRoom(): number {
    let room = Infinity;
    for (const c of computeCheck(chBodies, firstComment).channels) {
      const h = c.metrics?.hashtags;
      if (h?.limit != null) room = Math.min(room, h.limit - h.count);
    }
    return Math.max(0, room);
  }

  async function recheck() {
    setBusy("recheck");
    if (dirty && !(await save("silent"))) {
      setBusy(null);
      return;
    }
    const res = await recheckPostAction(post.id);
    setBusy(null);
    if (res.ok) {
      setValidatedAt(new Date());
      toast({ title: res.message ?? "Rechecked", tone: res.data && res.data.invalidCount > 0 ? "warning" : "success" });
      router.refresh();
    } else {
      toast({ title: "Couldn't recheck", description: res.error, tone: "error" });
    }
  }
  // Held in state rather than derived during render: reading the clock while
  // rendering is impure. Recomputed when the field changes and when the
  // schedule modal opens, which is when it can actually go stale.
  const [whenIsPast, setWhenIsPast] = React.useState(false);
  const isPast = (v: string) => {
    const t = new Date(v).getTime();
    return Number.isFinite(t) && t <= Date.now();
  };

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
    // map is { platform: body }. Build a reviewable proposal per channel —
    // nothing is applied until the user confirms in the dialog.
    const proposals: ChannelAdaptProposal[] = [];
    for (const c of selChannels) {
      if (c.id === fromChannelId) continue;
      const adapted = map[c.platform];
      if (!adapted) continue;
      const p = proposeAdaptation(rules, {
        platform: c.platform,
        contentType: chTypes[c.id] ?? defaultContentType(c.platform),
        before: chBodies[c.id] ?? "",
        adapted,
        tier: c.tier,
      });
      proposals.push({ ...p, channelId: c.id, name: c.name });
    }
    if (proposals.length === 0) {
      aiError("Nothing to adapt for the other channels");
      return;
    }
    setAdaptProposals(proposals);
  }

  function applyAdaptation(chosen: ChannelAdaptProposal[]) {
    setChBodies((prev) => {
      const next = { ...prev };
      for (const p of chosen) next[p.channelId] = p.after;
      return next;
    });
    setDirty(true);
    setAdaptProposals(null);
    toast({ title: `Adapted for ${chosen.length} channel${chosen.length === 1 ? "" : "s"}`, tone: "success" });
  }

  return (
    <div className="space-y-4" data-tour="composer">
      <FileDropOverlay enabled={!locked} onFiles={(f) => void onComposerUpload(f)} title="Drop to attach media" hint="Images and video are added to this post" />
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Link href="/composer" className="whitespace-nowrap text-[14px] text-[var(--text-muted)] hover:underline">
            ← All posts
          </Link>
          <StatusBadge status={post.status} />
          {dirty && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[12px] font-medium text-[var(--warning)]"
              role="status"
            >
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
              Unsaved changes
            </span>
          )}
          {saving && !dirty && (
            <span className="text-[12px] text-[var(--text-subtle)]" role="status">
              Saving…
            </span>
          )}
          {post.prediction && (
            <Badge tone={post.prediction.engagementScore >= 70 ? "success" : post.prediction.engagementScore >= 50 ? "warning" : "danger"}>
              AI score {post.prediction.engagementScore}
            </Badge>
          )}
          {evergreen && <Badge tone="info">Evergreen</Badge>}
        </div>

        {/* Action hierarchy: Schedule is the safe default (primary);
            irreversible Publish now sits beside it as secondary so the most
            prominent button is never the one you can't undo. Save/Predict
            are quiet ghost actions; destructive overflow lives in the menu. */}
        <div className="flex flex-wrap items-center gap-2">
          {!locked && (
            <Button size="sm" variant="ghost" onClick={() => save()} loading={saving}>
              <Save size={14} /> Save
            </Button>
          )}
          {!locked && (
            <Button size="sm" variant="ghost" onClick={() => guardedSaveThen(() => runPredictionAction(post.id), "predict")} loading={busy === "predict"}>
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
              <Button
                size="sm"
                disabled={selChannels.length === 0}
                aria-describedby={!canSend && blockingErrors.length > 0 ? "composer-errors" : undefined}
                onClick={() => attempt("schedule")}
              >
                <CalendarClock size={14} /> Schedule
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={selChannels.length === 0}
                aria-describedby={!canSend && blockingErrors.length > 0 ? "composer-errors" : undefined}
                onClick={() => attempt("queue")}
                loading={busy === "queue"}
              >
                <ListPlus size={14} /> Add to queue
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={selChannels.length === 0}
                title="Publish to all selected channels right now — this can't be undone"
                aria-describedby={!canSend && blockingErrors.length > 0 ? "composer-errors" : undefined}
                onClick={() => attempt("publish")}
                loading={busy === "publish"}
              >
                <Send size={14} /> Publish now
                {needsAttention && <span className="whitespace-nowrap text-[12px] font-medium text-[var(--danger)]">· {postCheck.invalidCount} need attention</span>}
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
            <MenuItem onClick={async () => {
              try {
                await duplicatePostAction(post.id);
              } catch (e) {
                // Next.js redirect() throws NEXT_REDIRECT on success — let it navigate.
                if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) throw e;
                toast({ title: "Couldn't duplicate", description: e instanceof Error ? e.message : "Try again.", tone: "error" });
              }
            }}>
              <Copy size={14} /> Duplicate
            </MenuItem>
            <MenuSeparator />
            {!locked && (
              <MenuItem onClick={() => guardedSaveThen(() => archivePostAction(post.id), "archive")}>
                <Archive size={14} /> Archive
              </MenuItem>
            )}
            <MenuItem
              destructive
              onClick={async () => {
                const live = post.status === "published";
                const ok = await confirmDestructive({
                  title: "Delete this post?",
                  body: live
                    ? "Some channels already published — the live posts stay up, but this draft, its schedule and its history are deleted permanently."
                    : "The draft, its schedule and its history are deleted permanently.",
                  confirmLabel: "Delete post",
                  irreversibleNote: "This can't be undone.",
                });
                if (ok) await deletePostAction(post.id);
              }}
            >
              <Trash2 size={14} /> Delete
            </MenuItem>
          </Dropdown>
        </div>
      </div>

      {post.status === "scheduled" && postCheck.invalidCount > 0 && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--danger)]/40 bg-[var(--danger-soft)] px-3 py-2 text-[13.5px] text-[var(--danger)]">
          <span>
            <strong>Action required before publishing.</strong> This scheduled post no longer passes the current platform rules, so it won&apos;t be sent as is.
          </span>
          <Button size="sm" variant="secondary" onClick={() => focusChannel(postCheck.channels.find((c) => !c.valid)?.channelId ?? "", "text")}>
            Review
          </Button>
        </div>
      )}
      <ReadinessPanel
        checks={postCheck.channels}
        onFocusChannel={focusChannel}
        onFix={startFix}
        validatedAt={validatedAt}
        onRecheck={post.status === "scheduled" || post.status === "draft" ? recheck : undefined}
        rechecking={busy === "recheck"}
      />

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

      {/* Mobile / Tablet Segmented Pane Switcher */}
      <div className="flex rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-sunken)] p-1 lg:hidden">
        <button
          type="button"
          onClick={() => setMobilePane("edit")}
          className={cn(
            "flex-1 py-1.5 text-center text-[13px] font-semibold rounded-[var(--radius-sm)] transition-all",
            mobilePane === "edit" ? "bg-[var(--surface)] text-[var(--text)] shadow-xs" : "text-[var(--text-muted)] hover:text-[var(--text)]",
          )}
        >
          Editor
        </button>
        <button
          type="button"
          onClick={() => setMobilePane("preview")}
          className={cn(
            "flex-1 py-1.5 text-center text-[13px] font-semibold rounded-[var(--radius-sm)] transition-all",
            mobilePane === "preview" ? "bg-[var(--surface)] text-[var(--text)] shadow-xs" : "text-[var(--text-muted)] hover:text-[var(--text)]",
          )}
        >
          Live Preview {selChannels.length > 0 ? `(${selChannels.length})` : ""}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Editor */}
        <div className={cn("space-y-4", mobilePane === "preview" ? "hidden lg:block" : "block")}>
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
                    "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-[background-color,border-color,color,transform] duration-[var(--mps-dur-micro)] ease-[var(--mps-ease)] active:scale-95 disabled:opacity-60",
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
                  {selected.includes(c.id) && checkFor(c.id) && <ChannelStatusLine check={checkFor(c.id)!} />}
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
            <div role="radiogroup" aria-label="Text for each channel" className="inline-flex flex-wrap gap-1 rounded-[var(--radius-md)] bg-[var(--bg-sunken)] p-1 text-[13px]">
              {([{ v: true, l: "Same text everywhere" }, { v: false, l: "Customize per channel" }] as const).map((o) => (
                <button
                  key={String(o.v)}
                  type="button"
                  role="radio"
                  aria-checked={sameForAll === o.v}
                  disabled={locked}
                  onClick={() => {
                    if (sameForAll === o.v) return;
                    setSameForAll(o.v);
                    if (o.v) {
                      // Copy the text you are looking at to every channel, so what the preview
                      // shows is exactly what gets saved and sent.
                      const text = chBodies[activeTab] ?? "";
                      setChBodies(Object.fromEntries(selected.map((id) => [id, text])));
                      setDirty(true);
                    }
                  }}
                  className={cn(
                    "rounded-[var(--radius-sm)] px-3 py-1 font-medium transition-colors disabled:opacity-60",
                    sameForAll === o.v ? "bg-[var(--surface)] text-[var(--text)] shadow-xs" : "text-[var(--text-muted)] hover:text-[var(--text)]",
                  )}
                >
                  {o.l}
                </button>
              ))}
            </div>
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
                const val = chBodies[editing] ?? "";
                const editCheck = checkFor(editing);
                const hashtagInfo = editCheck?.metrics?.hashtags ?? null;
                const seenTags = new Set<string>();
                const tagList = [...uniqueHashtags(val), ...uniqueHashtags(firstComment)]
                  .filter((h) => !seenTags.has(h.tag.toLowerCase()) && !!seenTags.add(h.tag.toLowerCase()))
                  .map((h) => h.text);
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
                                "inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium transition-[background-color,border-color,color,transform] duration-[var(--mps-dur-micro)] ease-[var(--mps-ease)] active:scale-95",
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
                      id="composer-body"
                      value={val}
                      disabled={locked}
                      aria-describedby="composer-limits"
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
                            const room = hashtagRoom();
                            if (room === 0) {
                              aiError("Hashtag limit reached — remove one to add another");
                              return;
                            }
                            const res = await aiHashtagsAction(val.split(/\s+/).slice(0, 6).join(" ") || title);
                            if (res.ok && res.data) {
                              // Add only as many as every selected platform can take, and say so.
                              const suggested = res.data as string[];
                              const take = Number.isFinite(room) ? suggested.slice(0, room) : suggested;
                              setBody(editing, take.reduce((acc, t) => appendHashtag(acc, t), val));
                              if (take.length < suggested.length) toast({ title: `Added ${take.length} of ${suggested.length} hashtags`, description: "The rest would go over a platform limit.", tone: "info" });
                            } else if (!res.ok) aiError(res.error ?? "Hashtag generation failed");
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
                      <div id="composer-limits" className="flex flex-col items-end gap-1">
                        {(sameForAll ? postCheck.channels : editCheck ? [editCheck] : []).map((c) => (
                          <div key={c.channelId} className="flex items-center gap-1.5">
                            {sameForAll && <PlatformBadge platform={c.platform} size={14} />}
                            <MetricChips check={c} />
                          </div>
                        ))}
                      </div>
                    </div>
                    {hashtagInfo && (hashtagInfo.limit != null || hashtagInfo.recommended != null || tagList.length > 0) && (
                      <div className="mt-3">
                        <HashtagManager
                          tags={tagList}
                          count={hashtagInfo.count}
                          limit={hashtagInfo.limit}
                          recommended={hashtagInfo.recommended}
                          platformName={PLATFORMS[plat]?.label ?? plat}
                          disabled={locked}
                          onAdd={(t) => setBody(editing, appendHashtag(val, t))}
                          onRemove={(t) => {
                            setBody(editing, removeHashtag(val, t));
                            if (firstComment) {
                              setFirstComment(removeHashtag(firstComment, t));
                              setDirty(true);
                            }
                          }}
                          onTrimExtras={() => {
                            const plan = hashtagInfo.limit != null ? planKeepFirst({ body: val, firstComment }, hashtagInfo.limit) : null;
                            if (plan) setFixState({ plan, channelId: editing });
                          }}
                        />
                      </div>
                    )}

                    {plat === "pinterest" && (
                      <PinterestOptions
                        accountId={channels.find((c) => c.id === editing)?.accountId}
                        contentType={editType}
                        meta={chMeta[editing] ?? {}}
                        onChange={(u) => updateChMeta(editing, u)}
                        disabled={locked}
                      />
                    )}

                    {plat === "gbp" && (
                      <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-sunken)]/60 p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[12.5px] font-semibold text-[var(--text)] flex items-center gap-1.5">
                            <PlatformBadge platform="gbp" size={13} />
                            Google Business Profile Options
                          </p>
                          <span className="text-[11px] font-medium text-[var(--text-subtle)] uppercase tracking-wide">
                            {editType === "event" ? "Event Post" : editType === "offer" ? "Offer Post" : "Update Post"}
                          </span>
                        </div>

                        {/* Event specific fields */}
                        {editType === "event" && (
                          <div className="space-y-2.5 pt-1 border-t border-[var(--border)]">
                            <div>
                              <label className="block text-[12px] font-medium text-[var(--text-muted)] mb-1">
                                Event Title <span className="text-[11px] text-[var(--text-subtle)]">(max 58 chars)</span>
                              </label>
                              <Input
                                disabled={locked}
                                maxLength={58}
                                value={chMeta[editing]?.eventTitle ?? ""}
                                onChange={(e) => updateChMeta(editing, { eventTitle: e.target.value })}
                                placeholder="e.g. Summer Kickoff Event"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">Start Date</label>
                                <Input
                                  type="date"
                                  disabled={locked}
                                  value={chMeta[editing]?.startDate ?? ""}
                                  onChange={(e) => updateChMeta(editing, { startDate: e.target.value })}
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">Start Time (optional)</label>
                                <Input
                                  type="time"
                                  disabled={locked}
                                  value={chMeta[editing]?.startTime ?? ""}
                                  onChange={(e) => updateChMeta(editing, { startTime: e.target.value })}
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">End Date</label>
                                <Input
                                  type="date"
                                  disabled={locked}
                                  value={chMeta[editing]?.endDate ?? ""}
                                  onChange={(e) => updateChMeta(editing, { endDate: e.target.value })}
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">End Time (optional)</label>
                                <Input
                                  type="time"
                                  disabled={locked}
                                  value={chMeta[editing]?.endTime ?? ""}
                                  onChange={(e) => updateChMeta(editing, { endTime: e.target.value })}
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Offer specific fields */}
                        {editType === "offer" && (
                          <div className="space-y-2.5 pt-1 border-t border-[var(--border)]">
                            <div>
                              <label className="block text-[12px] font-medium text-[var(--text-muted)] mb-1">
                                Offer Title <span className="text-[11px] text-[var(--text-subtle)]">(max 58 chars)</span>
                              </label>
                              <Input
                                disabled={locked}
                                maxLength={58}
                                value={chMeta[editing]?.offerTitle ?? ""}
                                onChange={(e) => updateChMeta(editing, { offerTitle: e.target.value })}
                                placeholder="e.g. 20% Off Weekend Special"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">Start Date</label>
                                <Input
                                  type="date"
                                  disabled={locked}
                                  value={chMeta[editing]?.startDate ?? ""}
                                  onChange={(e) => updateChMeta(editing, { startDate: e.target.value })}
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">End Date</label>
                                <Input
                                  type="date"
                                  disabled={locked}
                                  value={chMeta[editing]?.endDate ?? ""}
                                  onChange={(e) => updateChMeta(editing, { endDate: e.target.value })}
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">Coupon Code (optional)</label>
                                <Input
                                  disabled={locked}
                                  value={chMeta[editing]?.couponCode ?? ""}
                                  onChange={(e) => updateChMeta(editing, { couponCode: e.target.value })}
                                  placeholder="e.g. PROMO20"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">Redeem Online URL (optional)</label>
                                <Input
                                  disabled={locked}
                                  value={chMeta[editing]?.redeemUrl ?? ""}
                                  onChange={(e) => updateChMeta(editing, { redeemUrl: e.target.value })}
                                  placeholder="https://example.com/redeem"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">Terms & Conditions (optional)</label>
                              <Input
                                disabled={locked}
                                value={chMeta[editing]?.terms ?? ""}
                                onChange={(e) => updateChMeta(editing, { terms: e.target.value })}
                                placeholder="e.g. In-store only. One coupon per customer."
                              />
                            </div>
                          </div>
                        )}

                        {/* Call to action button */}
                        <div className="space-y-2 pt-1 border-t border-[var(--border)]">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                                Action Button (CTA)
                              </label>
                              <Select
                                disabled={locked}
                                value={chMeta[editing]?.ctaType ?? "ACTION_TYPE_UNSPECIFIED"}
                                onChange={(e) => updateChMeta(editing, { ctaType: e.target.value })}
                              >
                                <option value="ACTION_TYPE_UNSPECIFIED">None</option>
                                <option value="LEARN_MORE">Learn more</option>
                                <option value="BOOK">Book</option>
                                <option value="ORDER">Order online</option>
                                <option value="SHOP">Buy / Shop</option>
                                <option value="SIGN_UP">Sign up</option>
                                <option value="CALL">Call now</option>
                              </Select>
                            </div>
                            {chMeta[editing]?.ctaType &&
                              chMeta[editing]?.ctaType !== "ACTION_TYPE_UNSPECIFIED" &&
                              chMeta[editing]?.ctaType !== "CALL" && (
                                <div>
                                  <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                                    Button Destination URL
                                  </label>
                                  <Input
                                    disabled={locked}
                                    value={chMeta[editing]?.ctaUrl ?? ""}
                                    onChange={(e) => updateChMeta(editing, { ctaUrl: e.target.value })}
                                    placeholder="https://example.com/landing"
                                  />
                                </div>
                              )}
                          </div>
                          {chMeta[editing]?.ctaType === "CALL" && (
                            <p className="text-[11px] text-[var(--text-subtle)]">
                              ℹ The &quot;Call now&quot; button automatically connects callers to the primary phone number on your Google Business Profile location.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
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
                    onEdit={() => setEditingAsset(m)}
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
              <Textarea id="composer-first-comment" value={firstComment} disabled={locked} onChange={(e) => { setFirstComment(e.target.value); setDirty(true); }} placeholder="Auto-posted as the first comment where supported" className="min-h-[60px]" />
              {!locked && (
                <div className="mt-1.5">
                  <HashtagGroups
                    initialGroups={hashtagGroups}
                    activeBody={chBodies[activeTab] ?? ""}
                    onInsertToBody={(tagList) => {
                      // Respect every selected platform's hashtag limit (first-comment tags count too).
                      const room = hashtagRoom();
                      const fresh = tagList.filter((t) => !uniqueHashtags(`${chBodies[activeTab] ?? ""} ${firstComment}`).some((h) => h.tag.toLowerCase() === t.toLowerCase()));
                      const take = Number.isFinite(room) ? fresh.slice(0, room) : fresh;
                      if (take.length === 0) {
                        toast({ title: Number.isFinite(room) && room === 0 ? "Hashtag limit reached" : "Those hashtags are already in this post", tone: "info" });
                        return;
                      }
                      const suffix = take.map((t) => `#${t}`).join(" ");
                      setFirstComment((prev) => (prev ? `${prev} ${suffix}` : suffix));
                      setDirty(true);
                      if (take.length < fresh.length) toast({ title: `Added ${take.length} of ${fresh.length} hashtags`, description: "The rest would go over a platform limit.", tone: "info" });
                    }}
                    onMoveToFirstComment={() => {
                      const body = chBodies[activeTab] ?? "";
                      const found = uniqueHashtags(body).map((h) => h.text);
                      if (found.length === 0) return;
                      setBody(activeTab, removeSpans(body, findHashtags(body)));
                      setFirstComment((prev) => (prev ? `${prev} ${found.join(" ")}` : found.join(" ")));
                      setDirty(true);
                    }}
                  />
                </div>
              )}
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
              <Switch
                checked={evergreen}
                onCheckedChange={async (v) => {
                  setEvergreen(v);
                  setDirty(true);
                  const res = await toggleEvergreenAction(post.id, v);
                  if (!res.ok) {
                    // Roll back the optimistic flip so the switch never shows
                    // a state the server rejected.
                    setEvergreen(!v);
                    toast({ title: "Couldn't update evergreen", description: res.error, tone: "error" });
                  }
                }}
                label="Mark as evergreen (eligible for recycling)"
              />
            </div>
          </div>
        </div>

        {/* Preview + prediction */}
        <div className={cn("space-y-4", mobilePane === "edit" ? "hidden lg:block" : "block")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[14px] font-medium text-[var(--text)]">Live preview</p>
            <PreviewControls
              device={previewMode}
              onDeviceChange={setPreviewMode}
              theme={previewTheme}
              onThemeChange={setPreviewTheme}
              showSafeZone={showSafeZone}
              onShowSafeZoneChange={setShowSafeZone}
              hasVerticalMedia={selChannels.some(
                (c) =>
                  ["reel", "story", "short"].includes(chTypes[c.id] ?? defaultContentType(c.platform)) ||
                  c.platform === "tiktok",
              )}
              viewMode={previewViewMode}
              onViewModeChange={setPreviewViewMode}
              hasGridSupport={selChannels.some((c) => c.platform === "instagram")}
            />
          </div>
          {selChannels.length === 0 && <p className="text-[13px] text-[var(--text-subtle)]">Select a channel to preview.</p>}
          {selChannels.map((c) => (
            <div key={`${c.id}-${chTypes[c.id] ?? ""}`} className={cn("mps-swap", previewMode === "mobile" && "mx-auto max-w-[340px]")}>
              <PostPreview
                platform={c.platform}
                contentType={chTypes[c.id] ?? defaultContentType(c.platform)}
                name={c.name}
                handle={c.handle}
                // Exactly what the API will receive: links carry their UTM tags, as at publish time.
                body={applyUtm(bodyFor(c.id, chBodies), { source: utm.source, medium: utm.medium, campaign: utm.campaign }, c.platform)}
                hashtagLimit={checkFor(c.id)?.metrics?.hashtags?.limit ?? null}
                counter={(() => {
                  const chip = checkFor(c.id) ? metricChips(checkFor(c.id)!)[0] : undefined;
                  return chip ? { text: chip.text, over: chip.state === "error" } : undefined;
                })()}
                firstComment={firstComment}
                media={selMedia.map((m) => ({
                  url: m.thumbUrl ?? m.url,
                  fullUrl: m.url,
                  kind: m.kind,
                  width: m.width,
                  height: m.height,
                }))}
                theme={previewTheme}
                device={previewMode}
                showSafeZone={showSafeZone}
                viewMode={c.platform === "instagram" ? previewViewMode : "single"}
                metadata={chMeta[c.id] ? JSON.stringify(chMeta[c.id]) : null}
              />
            </div>
          ))}

          {/* Publishing is per channel, so a post can partly succeed. Showing
              only the first error (the previous behaviour) hid which channel
              failed and left the others' outcomes invisible. */}
          {post.channels.some((c) => c.error) && (
            <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-3 shadow-sm">
              <p className="text-[13px] font-semibold text-[var(--danger)]">
                {post.channels.filter((c) => c.error).length === post.channels.length
                  ? "Publishing failed"
                  : `Published to ${post.channels.filter((c) => !c.error && c.publishedUrl).length} of ${post.channels.length} channels`}
              </p>
              <ul className="space-y-1.5">
                {post.channels
                  .filter((c) => c.error)
                  .map((c) => {
                    const ch = channels.find((x) => x.id === c.channelId);
                    return (
                      <li key={c.channelId} className="flex gap-2 text-[13px] text-[var(--danger)]">
                        <PlatformBadge platform={c.platform} size={16} className="mt-0.5 shrink-0" />
                        <span>
                          <span className="font-medium">{ch?.name ?? c.platform}</span> — {c.error}
                        </span>
                      </li>
                    );
                  })}
              </ul>
              {post.channels.some((c) => !c.error && c.publishedUrl) && (
                <p className="text-[12px] text-[var(--text-muted)]">
                  Live on{" "}
                  {post.channels
                    .filter((c) => !c.error && c.publishedUrl)
                    .map((c) => channels.find((x) => x.id === c.channelId)?.name ?? c.platform)
                    .join(", ")}
                  . Retrying re-sends only the channels that failed.
                </p>
              )}
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

      <PublishSummaryDialog
        kind={summaryKind}
        checks={postCheck.channels}
        onFix={(id) => focusChannel(id, "text")}
        onPartial={(kind) => proceed(kind, true)}
        onClose={() => setSummaryKind(null)}
      />
      <FixDialog
        plan={fixState?.plan ?? null}
        platformName={fixState ? (channels.find((c) => c.id === fixState.channelId)?.name ?? "this channel") : ""}
        onApply={(plan) => fixState && applyFix(plan, fixState.channelId)}
        onClose={() => setFixState(null)}
      />
      <AdaptReviewDialog proposals={adaptProposals} onApply={applyAdaptation} onClose={() => setAdaptProposals(null)} />

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
              disabled={whenIsPast}
              onClick={() =>
                guardedSaveThen(
                  () =>
                    repeat.freq === "none"
                      ? schedulePostAction(post.id, new Date(when).toISOString(), partialSched ? { publishValidOnly: true } : undefined)
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
            <Input
              type="datetime-local"
              value={when}
              min={toLocalInput(new Date())}
              onChange={(e) => {
                setWhen(e.target.value);
                setWhenIsPast(isPast(e.target.value));
              }}
            />
          </Field>
          {workspaceTimezone && when && describeInZone(when, workspaceTimezone) && (
            <p className="text-[13px] text-[var(--text-muted)]">
              Workspace time: <span className="font-medium text-[var(--text)]">{describeInZone(when, workspaceTimezone)}</span>
            </p>
          )}
          {whenIsPast && (
            <p className="text-[13px] text-[var(--danger)]">
              That time has already passed. Pick a future time — a post scheduled in the past never gets picked up by the queue.
            </p>
          )}
          {bestTime && (
            <button
              type="button"
              onClick={() => {
                const d = new Date();
                d.setHours(bestTime.hour, 0, 0, 0);
                let add = (bestTime.weekday - d.getDay() + 7) % 7;
                if (add === 0 && d.getTime() <= Date.now()) add = 7;
                d.setDate(d.getDate() + add);
                setWhen(toLocalInput(d));
                setWhenIsPast(false);
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
          {unsplashEnabled || driveEnabled || googlePhotosEnabled || dropboxEnabled || onedriveEnabled || canvaEnabled ? (
            <div className="flex gap-1 rounded-[var(--radius-md)] bg-[var(--bg-sunken)] p-0.5 text-[13px]">
              {(
                [
                  "library",
                  ...(unsplashEnabled ? ["unsplash" as const] : []),
                  ...(driveEnabled ? ["drive" as const] : []),
                  ...(googlePhotosEnabled ? ["photos" as const] : []),
                  ...(dropboxEnabled ? ["dropbox" as const] : []),
                  ...(onedriveEnabled ? ["onedrive" as const] : []),
                  ...(canvaEnabled ? ["canva" as const] : []),
                ] as ("library" | "unsplash" | "drive" | "photos" | "dropbox" | "onedrive" | "canva")[]
              ).map((t) => (
                <button
                  key={t}
                  onClick={() => setMediaTab(t)}
                  className={cn(
                    "rounded-[var(--radius-sm)] px-2.5 py-1 font-medium capitalize",
                    mediaTab === t ? "bg-[var(--surface)] text-[var(--text)] shadow-sm" : "text-[var(--text-muted)]",
                  )}
                >
                  {t === "library"
                    ? "Your media"
                    : t === "unsplash"
                      ? "Unsplash"
                      : t === "drive"
                        ? "Drive"
                        : t === "photos"
                          ? "Photos"
                          : t === "dropbox"
                            ? "Dropbox"
                            : t === "onedrive"
                              ? "OneDrive"
                              : "Canva"}
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
        ) : mediaTab === "drive" ? (
          <DrivePicker
            onImported={(id) => {
              setMediaIds((ids) => [...new Set([...ids, id])]);
              setDirty(true);
              router.refresh();
            }}
          />
        ) : mediaTab === "photos" ? (
          <GooglePhotosPicker
            connected={!!googlePhotosConnected}
            onImported={(id) => {
              setMediaIds((ids) => [...new Set([...ids, id])]);
              setDirty(true);
              router.refresh();
            }}
          />
        ) : mediaTab === "dropbox" ? (
          <DropboxPicker
            connected={!!dropboxConnected}
            onImported={(id) => {
              setMediaIds((ids) => [...new Set([...ids, id])]);
              setDirty(true);
              router.refresh();
            }}
          />
        ) : mediaTab === "onedrive" ? (
          <OneDrivePicker
            connected={!!onedriveConnected}
            onImported={(id) => {
              setMediaIds((ids) => [...new Set([...ids, id])]);
              setDirty(true);
              router.refresh();
            }}
          />
        ) : mediaTab === "canva" ? (
          <CanvaDesignPicker connected={!!canvaConnected} />
        ) : media.length === 0 ? (
          <p className="text-[14px] text-[var(--text-muted)]">
            No media yet — hit <span className="font-medium text-[var(--text)]">Upload</span> above
            {unsplashEnabled ? ", try the Unsplash tab," : ""}, or add some in the{" "}
            <Link href="/media" className="text-[var(--primary)] underline">Media Library</Link>.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-3 sm:grid-cols-4">
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
                  {on && <span className="absolute right-1 top-1 rounded-full bg-[var(--primary)] p-0.5 text-[var(--primary-text)]"><CheckCheck size={11} /></span>}
                </button>
              );
            })}
          </div>
        )}
      </Modal>

      {/* Version history */}
      <Modal open={histOpen} onClose={() => setHistOpen(false)} title="Version history" size="md">
        <ul className="space-y-2">
          {post.versions.length === 0 && <InlineEmpty
            title="No saved versions yet"
            hint="Each time you save, a snapshot is kept here so you can compare or restore earlier drafts."
          />}
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

      {/* Media Editor Modal */}
      <MediaEditorModal
        open={!!editingAsset}
        onClose={() => setEditingAsset(null)}
        asset={editingAsset}
        onSaveSuccess={(newAsset) => {
          if (editingAsset) {
            setMediaIds((prev) => prev.map((id) => (id === editingAsset.id ? newAsset.id : id)));
            setDirty(true);
            router.refresh();
          }
        }}
      />

      {/* Publishing Active State */}
      {busy === "publish" && (
        <Modal open={true} onClose={() => {}} title="Publishing Post">
          <AppLoader
            variant="modal"
            size="md"
            state="thinking"
            text="Publishing post to connected channels…"
            subtext="Broadcasting media and content to selected social platforms"
          />
        </Modal>
      )}

      {/* AI Channel Adaptation Active State */}
      {busy === "adapt" && (
        <Modal open={true} onClose={() => {}} title="Adapting Content">
          <AppLoader
            variant="modal"
            size="md"
            state="thinking"
            text="Adapting content for selected channels…"
            subtext="Synthesizing platform-optimized copy and character counts"
          />
        </Modal>
      )}
    </div>
  );
}

function MediaAltRow({
  media,
  postTitle,
  locked,
  onRemove,
  onEdit,
}: {
  media: { id: string; url: string; thumbUrl: string | null; kind: string; filename: string; altText: string };
  postTitle: string;
  locked: boolean;
  onRemove: () => void;
  onEdit?: () => void;
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
            aria-label={`Alt text for ${media.filename}`}
            onChange={(e) => setAlt(e.target.value)}
            onBlur={async () => {
              if (alt === media.altText) return;
              setBusy("save");
              await updateAssetAction(media.id, { altText: alt });
              setBusy(null);
            }}
            placeholder="Alt text — describe the image for screen readers"
            className="h-8 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 text-[13px] focus-visible:outline-2 focus-visible:outline-[var(--ring)] disabled:opacity-50"
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
          {!locked && onEdit && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={onEdit}
              title={media.kind === "video" ? "Select video thumbnail" : "Edit image (crop, rotate, watermark)"}
              className="flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1.5 text-[12px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] disabled:opacity-40"
            >
              <Crop size={11} /> {media.kind === "video" ? "Cover" : "Edit"}
            </button>
          )}
        </div>
      </div>
      {!locked && (
        <button onClick={onRemove} className="shrink-0 rounded-full p-1.5 text-[var(--text-subtle)] hover:text-[var(--danger)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]" aria-label={`Remove ${media.filename}`} title="Remove">
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
        {comments.length === 0 && <InlineEmpty
          title="No comments yet"
          hint="Leave a note for a teammate here — they'll see it when reviewing this post."
        />}
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
