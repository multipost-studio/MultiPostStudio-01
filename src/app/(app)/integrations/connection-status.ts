/**
 * Human copy for connection states and OAuth failures.
 *
 * Both used to surface raw machine values: the account badge printed
 * `expired` / `error` / `disconnected`, and a failed connect rendered
 * "Connect failed: instagram-not-in-plan". Neither told the user what the
 * consequence was or what to do next.
 */

type StatusMeta = {
  label: string;
  tone: "success" | "warning" | "danger";
  /** What it means for the user, and the way out. Omitted when healthy. */
  detail?: string;
};

export function connectionStatus(status: string): StatusMeta {
  switch (status) {
    case "connected":
      return { label: "Connected", tone: "success" };
    case "expired":
      return {
        label: "Token expired",
        tone: "warning",
        detail:
          "The platform's access token has run out. Scheduled posts to this account will fail until you reconnect.",
      };
    case "error":
      return {
        label: "Needs attention",
        tone: "danger",
        detail:
          "The platform rejected our last request — usually a revoked permission or a changed password. Reconnect to grant access again.",
      };
    case "disconnected":
      return {
        label: "Disconnected",
        tone: "danger",
        detail: "This account was disconnected. Reconnect it to resume publishing and collecting analytics.",
      };
    default:
      return { label: status, tone: "warning" };
  }
}

/**
 * Turns an OAuth `?error=` code into a sentence. Codes are produced by
 * src/app/api/oauth/[platform]/{start,callback}; anything unrecognised falls
 * back to the raw value so a new code is still visible rather than swallowed.
 */
export function oauthErrorMessage(code: string): string {
  const platform = code.split(/-|:/)[0];
  const nice = platform.charAt(0).toUpperCase() + platform.slice(1);

  if (code.endsWith("-not-in-plan")) {
    return `${nice} isn't included in your current plan. Upgrade to connect it, or pick a platform your plan covers.`;
  }
  if (code.endsWith("-not-configured")) {
    return `${nice} isn't set up on this deployment yet — its API credentials are missing. Contact your workspace admin.`;
  }
  if (code.endsWith("-connect-failed")) {
    return `${nice} didn't complete the connection. This is usually temporary — try connecting again.`;
  }
  switch (code) {
    case "expired-oauth-state":
      return "The connection link expired before it was finished. Start the connection again.";
    case "invalid-oauth-state":
      return "That connection attempt couldn't be verified, so it was stopped. Start again from this page.";
    case "no-workspace":
      return "No active workspace was selected, so there was nowhere to attach the account. Pick a workspace and retry.";
    case "forbidden":
      return "Your role doesn't allow connecting accounts. Ask an owner or admin of this workspace.";
    default:
      // e.g. "instagram: access_denied" — the provider's own reason.
      return `The platform reported: ${code}. If you cancelled the authorisation screen, just try again.`;
  }
}
