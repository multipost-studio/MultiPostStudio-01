/**
 * A written reason for a sensitive admin action (changing an invoice, overriding a plan, adjusting credits).
 * Required so the audit log says why, not only who and what. Pure: used by the server actions and, for the same
 * limits, by the dialog.
 */
export const REASON_MIN = 8;
export const REASON_MAX = 300;

export type ReasonResult = { ok: true; reason: string } | { ok: false; error: string };

export function parseReason(v: unknown): ReasonResult {
  if (typeof v !== "string") return { ok: false, error: `Give a reason (at least ${REASON_MIN} characters)` };
  const reason = v.replace(/\s+/g, " ").trim();
  if (reason.length < REASON_MIN) return { ok: false, error: `Give a reason (at least ${REASON_MIN} characters)` };
  if (reason.length > REASON_MAX) return { ok: false, error: `Keep the reason under ${REASON_MAX} characters` };
  return { ok: true, reason };
}
