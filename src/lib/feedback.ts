/**
 * In-app feedback: the two questions, and how they become a support ticket.
 *
 * Kept out of the server action so the limits the form enforces and the limits
 * the server enforces are literally the same numbers — a client-only character
 * cap is a suggestion, not a rule.
 */

/** Matches the counter shown under each textarea. */
export const FIELD_MAX = 300;

/** Below this, a report is too vague to act on. */
export const FIELD_MIN = 3;

export type FeedbackInput = {
  /** "What were you trying to do?" */
  goal: string;
  /** "What got in your way, and what might help?" */
  problem: string;
  /** Path the user was on when they opened the form. */
  context?: string | null;
};

export type FeedbackError = { field: "goal" | "problem"; message: string };

/** Validate both answers, returning every problem at once. */
export function validateFeedback(input: FeedbackInput): FeedbackError[] {
  const errors: FeedbackError[] = [];
  const check = (field: "goal" | "problem", value: string, label: string) => {
    const v = value.trim();
    if (v.length < FIELD_MIN) errors.push({ field, message: `${label} is required.` });
    else if (v.length > FIELD_MAX) {
      errors.push({ field, message: `${label} must be ${FIELD_MAX} characters or fewer.` });
    }
  };
  check("goal", input.goal, "What you were trying to do");
  check("problem", input.problem, "What got in your way");
  return errors;
}

/**
 * A subject short enough to scan in the admin queue.
 *
 * Taken from the goal rather than the complaint, because "Schedule a post to
 * Instagram" identifies the area faster than "it didn't work".
 */
export function feedbackSubject(goal: string): string {
  const clean = goal.trim().replace(/\s+/g, " ");
  const cut = clean.length > 70 ? `${clean.slice(0, 69).trimEnd()}…` : clean;
  return `Feedback: ${cut}`;
}

/** Both answers as one readable body, since a ticket has a single body field. */
export function feedbackBody(input: FeedbackInput): string {
  return [
    "What they were trying to do:",
    input.goal.trim(),
    "",
    "What got in their way:",
    input.problem.trim(),
  ].join("\n");
}

/**
 * Keep only an in-app path.
 *
 * The context comes from the browser, so it is untrusted: anything that isn't
 * a same-app path is dropped rather than stored and later rendered in the
 * admin queue.
 */
export function sanitizeContext(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v.startsWith("/") || v.startsWith("//")) return null;
  return v.slice(0, 200);
}
