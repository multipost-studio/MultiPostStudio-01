/**
 * Errors that say nothing is wrong with the app, kept out of Sentry so the real ones stay visible. Shared by the browser, server
 * and edge Sentry configs. Pure (no imports), so it is safe in every runtime.
 */

export const IGNORED_ERRORS: (string | RegExp)[] = [
  // The visitor navigated away or closed the tab mid-response.
  "The destination stream closed early",
  "ERR_STREAM_PREMATURE_CLOSE",
  // A tab left open across a deploy still posts old server-action ids. The app shows a "reload" prompt (StaleDeployGuard).
  // Next words this two ways: "Server Action ... was not found" and "Failed to find Server Action ...".
  "UnrecognizedActionError",
  /Server Action .* was not found on the server/,
  /Failed to find Server Action/,
  // Node's bare "aborted" when a client drops a request half way.
  /^aborted$/,
];

type EventLike = {
  exception?: { values?: { type?: string; value?: string }[] };
  breadcrumbs?: { message?: string }[];
};

/**
 * A browser "Failed to fetch" that happened while Next was loading the next page in the background (a link prefetch or
 * navigation payload). The visitor was offline, switched network or had a blocker; Next falls back to a normal page load by
 * itself ("Falling back to browser navigation"), so nobody sees a failure. Real API failures are not matched: they don't
 * have that console line next to them.
 */
export function isBackgroundNavigationFetchFailure(event: EventLike): boolean {
  const failed = event.exception?.values?.some((v) => v.type === "TypeError" && /^(Failed to fetch|Load failed|NetworkError)/i.test(v.value ?? ""));
  if (!failed) return false;
  return (event.breadcrumbs ?? []).some((b) => /Failed to fetch RSC payload/i.test(b.message ?? ""));
}

/** `beforeSend` for the browser config: returns null to drop the event. */
export function dropBenignBrowserEvent<T extends EventLike>(event: T): T | null {
  return isBackgroundNavigationFetchFailure(event) ? null : event;
}
