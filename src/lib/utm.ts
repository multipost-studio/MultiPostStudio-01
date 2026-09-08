/**
 * Append UTM parameters to the links in a post body.
 *
 * The composer has collected utmSource / utmMedium / utmCampaign since day
 * one, stored them on the post and copied them when duplicating or recycling
 * — and nothing ever applied them. Every post tagged for a campaign went out
 * with untagged links, so the campaign never appeared in the customer's
 * analytics.
 *
 * Applied at publish time rather than on save, so the body the author sees
 * stays readable and each platform gets its own utm_source.
 */

export type UtmTags = {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
};

/** URLs, minus the punctuation that usually ends the sentence around them. */
const URL_RE = /https?:\/\/[^\s<>"'`]+/g;
const TRAILING = /[.,;:!?)\]]+$/;

/** A UTM value safe to put in a query string. */
function clean(v: string | null | undefined): string | undefined {
  const t = (v ?? "").trim();
  return t ? t.slice(0, 100) : undefined;
}

/**
 * Rewrite every link in `body`, tagging it for `platform`.
 *
 * - Returns the body unchanged when there is nothing to tag, so a post with no
 *   campaign is byte-identical to what the author wrote.
 * - Never overwrites a parameter the author put there themselves: someone who
 *   hand-wrote ?utm_source=newsletter meant it.
 * - Leaves anything that isn't a parsable URL exactly as-is.
 */
export function applyUtm(body: string, tags: UtmTags, platform: string): string {
  const campaign = clean(tags.campaign);
  const medium = clean(tags.medium);
  // The platform is the natural source and the reason this runs per channel;
  // an explicit value still wins.
  const source = clean(tags.source) ?? (campaign || medium ? platform : undefined);
  if (!campaign && !medium && !clean(tags.source)) return body;

  return body.replace(URL_RE, (match) => {
    const trailing = match.match(TRAILING)?.[0] ?? "";
    const raw = trailing ? match.slice(0, -trailing.length) : match;
    try {
      const url = new URL(raw);
      if (source && !url.searchParams.has("utm_source")) url.searchParams.set("utm_source", source);
      if (medium && !url.searchParams.has("utm_medium")) url.searchParams.set("utm_medium", medium);
      if (campaign && !url.searchParams.has("utm_campaign")) {
        url.searchParams.set("utm_campaign", campaign);
      }
      return url.toString() + trailing;
    } catch {
      return match; // not a URL we can parse — leave the author's text alone
    }
  });
}
