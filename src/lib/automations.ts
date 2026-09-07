/**
 * The automation trigger/action matrix — one source of truth.
 *
 * The form used to offer 5 triggers × 4 actions while the engine implemented
 * 3 pairs, so 17 of the 20 combinations a user could build were accepted,
 * saved, and then never ran: the card just said "never run" forever with no
 * explanation. The UI, the server action and the engine now all read this, so
 * a combination can only be offered if something actually runs it.
 *
 * Two options were removed rather than implemented:
 *  - `threshold_reached` was a second name for `high_engagement` with the same
 *    configuration and no distinct meaning.
 *  - `assign` was listed as an action label but was never in the form and has
 *    no implementation; assignment is done on the post itself.
 * Existing rows using them still render (see `isSupportedPair`), flagged as
 * unsupported instead of silently doing nothing.
 */

export const TRIGGERS = ["post_published", "high_engagement", "draft_created", "approval_requested"] as const;
export const ACTIONS = ["notify", "tag_high_performer", "recommend_repurpose", "run_ai_optimize"] as const;

export type TriggerType = (typeof TRIGGERS)[number];
export type ActionType = (typeof ACTIONS)[number];

export const TRIGGER_LABEL: Record<string, string> = {
  post_published: "A post is published",
  high_engagement: "A post gets high engagement",
  draft_created: "A draft is created",
  approval_requested: "Approval is requested",
  // Retired — kept so old rows still read sensibly on the page.
  threshold_reached: "A post reaches a threshold",
};

export const ACTION_LABEL: Record<string, string> = {
  notify: "Send a notification",
  tag_high_performer: "Tag it as high-performing",
  recommend_repurpose: "Recommend repurposing",
  run_ai_optimize: "Run AI optimization",
  assign: "Assign to a teammate",
};

/** Which actions each trigger can run. Every pair here is implemented in
 *  `runDueAutomations` — adding one to this list without an implementation
 *  reintroduces exactly the dead-automation bug this table exists to prevent. */
export const MATRIX: Record<TriggerType, readonly ActionType[]> = {
  post_published: ["notify", "recommend_repurpose"],
  high_engagement: ["notify", "tag_high_performer", "recommend_repurpose"],
  draft_created: ["notify", "run_ai_optimize"],
  approval_requested: ["notify"],
};

/** Actions offered for a trigger; empty for an unknown or retired trigger.
 *  Uses hasOwn because the trigger is user input: `MATRIX["__proto__"]` is not
 *  undefined, it's Object.prototype. */
export function actionsFor(trigger: string): readonly ActionType[] {
  return Object.hasOwn(MATRIX, trigger) ? MATRIX[trigger as TriggerType] : [];
}

/** True when the engine has an implementation for this pair. */
export function isSupportedPair(trigger: string, action: string): boolean {
  return (actionsFor(trigger) as readonly string[]).includes(action);
}

/** Only the high-engagement trigger reads a threshold. */
export function usesThreshold(trigger: string): boolean {
  return trigger === "high_engagement";
}
