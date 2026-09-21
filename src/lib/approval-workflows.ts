/**
 * MultiPost Studio — Approval Workflows Core Library
 *
 * Provides domain logic, SLA calculation, structured revision reasons,
 * and timeline formatting for multi-stage approval processes.
 */

export type RevisionReasonKey =
  | "copy_edit"
  | "brand_voice"
  | "media_assets"
  | "legal_compliance"
  | "timing_strategy"
  | "other";

export interface RevisionReasonDef {
  key: RevisionReasonKey;
  label: string;
  description: string;
  badgeTone: "neutral" | "warning" | "danger" | "info" | "primary" | "success";
}

export const REVISION_REASONS: RevisionReasonDef[] = [
  {
    key: "copy_edit",
    label: "Copy & Typo",
    description: "Grammar, spelling, tone adjustment or wording correction",
    badgeTone: "info",
  },
  {
    key: "brand_voice",
    label: "Brand Voice",
    description: "Doesn't align with brand tone guidelines or banned terms used",
    badgeTone: "warning",
  },
  {
    key: "media_assets",
    label: "Media & Visuals",
    description: "Image/video aspect ratio, quality, or visual mismatch",
    badgeTone: "neutral",
  },
  {
    key: "legal_compliance",
    label: "Legal & Compliance",
    description: "Disclosures, copyright, claims, or regulatory constraints",
    badgeTone: "danger",
  },
  {
    key: "timing_strategy",
    label: "Timing & Strategy",
    description: "Scheduling date, campaign tagging, or channel selection change",
    badgeTone: "primary",
  },
  {
    key: "other",
    label: "Other",
    description: "Specific changes described in comment",
    badgeTone: "neutral",
  },
];

export function getRevisionReason(key: string | null | undefined): RevisionReasonDef | null {
  if (!key) return null;
  return REVISION_REASONS.find((r) => r.key === key) ?? null;
}

export function getRevisionReasonLabel(key: string | null | undefined): string {
  const match = getRevisionReason(key);
  return match ? match.label : key ? key.replace(/_/g, " ") : "Changes requested";
}

export interface StageSlaInfo {
  hasSla: boolean;
  deadline: Date | null;
  isOverdue: boolean;
  hoursLeft: number;
  minutesLeft: number;
  formattedTimeLeft: string;
  statusLevel: "normal" | "warning" | "critical" | "overdue";
  timeoutAction: string | null;
  escalateToRole: string | null;
}

/**
 * Calculates countdown and SLA violation metrics for an approval stage.
 */
export function calculateStageSla(
  stageEnteredAt: Date | string | null | undefined,
  timeoutHours: number | null | undefined,
  timeoutAction?: string | null,
  escalateToRole?: string | null,
  now = Date.now(),
): StageSlaInfo {
  if (!stageEnteredAt || !timeoutHours || timeoutHours <= 0) {
    return {
      hasSla: false,
      deadline: null,
      isOverdue: false,
      hoursLeft: 0,
      minutesLeft: 0,
      formattedTimeLeft: "",
      statusLevel: "normal",
      timeoutAction: null,
      escalateToRole: null,
    };
  }

  const enteredMs = typeof stageEnteredAt === "string" ? new Date(stageEnteredAt).getTime() : stageEnteredAt.getTime();
  const deadlineMs = enteredMs + timeoutHours * 3600 * 1000;
  const diffMs = deadlineMs - now;
  const isOverdue = diffMs <= 0;
  const absDiff = Math.abs(diffMs);
  const totalMins = Math.floor(absDiff / (60 * 1000));
  const hoursLeft = Math.floor(totalMins / 60);
  const minutesLeft = totalMins % 60;

  let formattedTimeLeft: string;
  if (isOverdue) {
    formattedTimeLeft = hoursLeft > 0 ? `${hoursLeft}h ${minutesLeft}m overdue` : `${minutesLeft}m overdue`;
  } else {
    formattedTimeLeft = hoursLeft > 0 ? `${hoursLeft}h ${minutesLeft}m left` : `${minutesLeft}m left`;
  }

  let statusLevel: "normal" | "warning" | "critical" | "overdue" = "normal";
  if (isOverdue) {
    statusLevel = "overdue";
  } else if (diffMs < 2 * 3600 * 1000) {
    statusLevel = "critical";
  } else if (diffMs < 6 * 3600 * 1000) {
    statusLevel = "warning";
  }

  return {
    hasSla: true,
    deadline: new Date(deadlineMs),
    isOverdue,
    hoursLeft: isOverdue ? -hoursLeft : hoursLeft,
    minutesLeft,
    formattedTimeLeft,
    statusLevel,
    timeoutAction: timeoutAction ?? null,
    escalateToRole: escalateToRole ?? null,
  };
}

export interface TimelineEntry {
  id: string;
  action: string;
  actor: string;
  actorLabel?: string | null;
  comment: string | null;
  reasonCategory: string | null;
  reasonDef: RevisionReasonDef | null;
  createdAt: string;
  formattedAction: string;
}

/**
 * Formats approval actions into human-readable chronological timeline items.
 */
export function formatTimelineActions(
  actions: Array<{
    id: string;
    action: string;
    comment: string | null;
    actor?: { name: string } | null;
    actorLabel?: string | null;
    reasonCategory?: string | null;
    createdAt: Date | string;
  }>,
): TimelineEntry[] {
  return actions.map((a) => {
    const actorName = a.actor?.name ?? a.actorLabel ?? "Unknown";
    const reasonDef = getRevisionReason(a.reasonCategory);
    let formattedAction = a.action.replace(/_/g, " ");
    if (a.action === "request_changes") formattedAction = "requested changes";
    else if (a.action === "approve") formattedAction = "approved stage";
    else if (a.action === "reject") formattedAction = "rejected post";
    else if (a.action === "resubmit") formattedAction = "resubmitted revised post";
    else if (a.action === "comment") formattedAction = "commented";

    return {
      id: a.id,
      action: a.action,
      actor: actorName,
      actorLabel: a.actorLabel,
      comment: a.comment,
      reasonCategory: a.reasonCategory ?? null,
      reasonDef,
      createdAt: typeof a.createdAt === "string" ? a.createdAt : a.createdAt.toISOString(),
      formattedAction,
    };
  });
}
