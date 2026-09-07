/**
 * AI credit arithmetic.
 *
 * The monthly budget used to be a tripwire rather than a ceiling: the gate
 * refused only once usage had already reached the plan limit, so an org one
 * credit short of its cap could request 50 captions and be billed for all 50.
 * Requests are now clamped to what the org can actually pay for.
 */

/** Clamp a requested quantity to the credits still available. */
export function affordable(requested: number, remaining: number): number {
  // A plan that does not meter AI credits reports Infinity — nothing to clamp.
  if (!Number.isFinite(remaining)) return Math.max(0, requested);
  return Math.max(0, Math.min(requested, remaining));
}
