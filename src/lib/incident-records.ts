/**
 * Follow-up on a health incident: who owns it, where it stands, and the written postmortem.
 * The incident itself is derived from probe history and has no row of its own; its id (`probeId@startedAt`) is the key
 * of the IncidentRecord that holds the follow-up. Pure helpers shared by the action, the page and the tests.
 */
export const INCIDENT_STATUSES = [
  { id: "open", label: "Open" },
  { id: "investigating", label: "Investigating" },
  { id: "monitoring", label: "Monitoring" },
  { id: "resolved", label: "Follow-up done" },
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number]["id"];

export const isIncidentStatus = (v: unknown): v is IncidentStatus => INCIDENT_STATUSES.some((s) => s.id === v);
export const incidentStatusLabel = (v: string): string => INCIDENT_STATUSES.find((s) => s.id === v)?.label ?? v;

export const POSTMORTEM_MAX = 8000;
export const TITLE_MAX = 160;

/** `probeId@2026-10-09T12:00:00.000Z` as deriveIncidents writes it. Anything else is not an incident key. */
const KEY_RE = /^[A-Za-z0-9_.:-]{1,80}@\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

export function isIncidentKey(v: unknown): v is string {
  return typeof v === "string" && v.length <= 120 && KEY_RE.test(v) && !Number.isNaN(Date.parse(v.slice(v.indexOf("@") + 1)));
}
