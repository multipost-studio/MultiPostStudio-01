import { z } from "zod";

/**
 * Acquisition attribution — pure, shared by the tracking endpoint, signup, the
 * admin reports and the audience filters. Everything a visitor can hand us
 * (UTM params, referrer, click ids) is untrusted text: it is normalised and
 * length-capped here, once, so the rest of the system can treat it as clean.
 */

export const CHANNELS = [
  "Paid Search",
  "Paid Social",
  "Organic Search",
  "Organic Social",
  "Email",
  "Affiliate",
  "Referral",
  "Display",
  "Direct",
  "Other",
] as const;
export type Channel = (typeof CHANNELS)[number];

/** Rows with no tracking data at all (signed up before tracking existed). */
export const UNTRACKED = "(not tracked)";

export type Touch = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  term: string | null;
  content: string | null;
  referrerHost: string | null;
  landingPath: string;
  clickId: string | null;
  channel: Channel;
  /** Epoch ms. */
  ts: number;
  /** True when the visit carried any marketing signal (UTM, click id, ref, external referrer). */
  signal: boolean;
};

const MAX = 80;

/** Lowercase, trim, spaces to underscores, strip anything odd. null when nothing is left. */
export function sanitizeValue(v: unknown, max = MAX): string | null {
  if (typeof v !== "string") return null;
  const out = v
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_\-.+:/%@]/gu, "")
    .slice(0, max);
  return out || null;
}

// Common spellings that would otherwise split one source into several rows.
const SOURCE_ALIASES: Record<string, string> = {
  fb: "facebook",
  "facebook.com": "facebook",
  "m.facebook.com": "facebook",
  "l.facebook.com": "facebook",
  "lm.facebook.com": "facebook",
  meta: "facebook",
  ig: "instagram",
  "instagram.com": "instagram",
  "l.instagram.com": "instagram",
  li: "linkedin",
  "linkedin.com": "linkedin",
  "lnkd.in": "linkedin",
  tw: "x",
  twitter: "x",
  "twitter.com": "x",
  "x.com": "x",
  "t.co": "x",
  yt: "youtube",
  "youtube.com": "youtube",
  "m.youtube.com": "youtube",
  goog: "google",
  google_ads: "google",
  googleads: "google",
  adwords: "google",
  "google.com": "google",
  "bing.com": "bing",
  "duckduckgo.com": "duckduckgo",
  ddg: "duckduckgo",
  "reddit.com": "reddit",
  "old.reddit.com": "reddit",
  "pinterest.com": "pinterest",
  "tiktok.com": "tiktok",
  "threads.net": "threads",
  "producthunt.com": "producthunt",
  ph: "producthunt",
  hn: "hackernews",
  "news.ycombinator.com": "hackernews",
};

const SEARCH_SOURCES = new Set(["google", "bing", "duckduckgo", "yahoo", "baidu", "yandex", "ecosia", "brave", "startpage"]);
const SOCIAL_SOURCES = new Set([
  "facebook", "instagram", "linkedin", "x", "youtube", "reddit", "pinterest", "tiktok", "threads", "bluesky", "whatsapp", "telegram", "quora", "snapchat",
]);

export function canonicalSource(raw: unknown): string | null {
  const s = sanitizeValue(raw);
  if (!s) return null;
  const noWww = s.replace(/^www\./, "");
  if (SOURCE_ALIASES[noWww]) return SOURCE_ALIASES[noWww];
  // google.co.in, yahoo.co.jp, yandex.ru ...
  const base = noWww.split(".")[0];
  if (/^(google|yahoo|yandex|bing)\./.test(noWww) && SEARCH_SOURCES.has(base)) return base;
  return noWww;
}

const MEDIUM_ALIASES: Record<string, string> = {
  "e-mail": "email",
  e_mail: "email",
  newsletter: "email",
  ppc: "cpc",
  paidsearch: "paid_search",
  paidsocial: "paid_social",
  "paid-social": "paid_social",
  social_paid: "paid_social",
  "social-network": "social",
  social_media: "social",
  socialmedia: "social",
  sm: "social",
  organic_social: "social",
  partner: "affiliate",
};

export function canonicalMedium(raw: unknown): string | null {
  const m = sanitizeValue(raw);
  if (!m) return null;
  return MEDIUM_ALIASES[m] ?? m;
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

const CLICK_IDS = ["gclid", "gbraid", "wbraid", "msclkid", "fbclid", "ttclid", "li_fat_id"] as const;

export function classifyChannel(i: {
  source: string | null;
  medium: string | null;
  referrerHost: string | null;
  clickId: string | null;
  hasRef: boolean;
}): Channel {
  const { source, medium } = i;
  const social = !!source && SOCIAL_SOURCES.has(source);
  const search = !!source && SEARCH_SOURCES.has(source);

  if (medium) {
    if (["cpc", "paid_search", "sem", "adwords"].includes(medium) || medium === "paid") return social ? "Paid Social" : "Paid Search";
    if (["paid_social", "cpv", "cpa"].includes(medium)) return "Paid Social";
    if (["display", "banner", "cpm", "expandable", "interstitial"].includes(medium)) return "Display";
    if (medium === "email") return "Email";
    if (medium === "affiliate") return "Affiliate";
    if (medium === "organic") return social ? "Organic Social" : "Organic Search";
    if (medium === "social") return "Organic Social";
    if (["referral", "link", "ref"].includes(medium)) return "Referral";
  }
  if (source === "email" || source === "newsletter") return "Email";
  if (i.hasRef) return "Affiliate";
  if (medium) return social ? "Organic Social" : search ? "Organic Search" : "Other";
  if (social) return "Organic Social";
  if (search) return "Organic Search";
  if (i.referrerHost) return "Referral";
  return "Direct";
}

/**
 * Turn a landing URL (path + query), the document referrer and our own hosts
 * into a normalised Touch. A referrer from one of `selfHosts` is ignored (an
 * internal navigation is not an acquisition source).
 */
export function parseTouch(input: { landing: string; referrer?: string | null; selfHosts: string[]; now?: number }): Touch {
  let url: URL;
  try {
    url = new URL(input.landing, "https://placeholder.invalid");
  } catch {
    url = new URL("/", "https://placeholder.invalid");
  }
  const q = url.searchParams;
  const self = new Set(input.selfHosts.map((h) => h.toLowerCase().replace(/^www\./, "")));
  const refHost = hostOf(input.referrer);
  const referrerHost = refHost && !self.has(refHost) ? refHost : null;

  const clickKey = CLICK_IDS.find((k) => q.get(k));
  const hasRef = !!q.get("ref") || !!q.get("aff");

  let source = canonicalSource(q.get("utm_source") ?? q.get("source"));
  let medium = canonicalMedium(q.get("utm_medium"));

  // No explicit tagging: infer what we honestly can from click ids / referrer.
  if (!source && clickKey) {
    source = clickKey === "gclid" || clickKey === "gbraid" || clickKey === "wbraid" ? "google" : clickKey === "msclkid" ? "bing" : clickKey === "fbclid" ? "facebook" : clickKey === "ttclid" ? "tiktok" : clickKey === "li_fat_id" ? "linkedin" : null;
    if (!medium) medium = clickKey === "gclid" || clickKey === "gbraid" || clickKey === "wbraid" || clickKey === "msclkid" ? "cpc" : null;
  }
  if (!source && referrerHost) source = canonicalSource(referrerHost);

  const channel = classifyChannel({ source, medium, referrerHost, clickId: clickKey ?? null, hasRef });
  const path = (url.pathname || "/").slice(0, 200);

  return {
    source,
    medium,
    campaign: sanitizeValue(q.get("utm_campaign")),
    term: sanitizeValue(q.get("utm_term")),
    content: sanitizeValue(q.get("utm_content")),
    referrerHost: referrerHost ? referrerHost.slice(0, 120) : null,
    landingPath: path,
    clickId: clickKey ?? null,
    channel,
    ts: input.now ?? Date.now(),
    signal: !!(q.get("utm_source") || q.get("utm_medium") || q.get("utm_campaign") || clickKey || hasRef || referrerHost),
  };
}

const touchSchema = z.object({
  source: z.string().max(MAX).nullable(),
  medium: z.string().max(MAX).nullable(),
  campaign: z.string().max(MAX).nullable(),
  term: z.string().max(MAX).nullable(),
  content: z.string().max(MAX).nullable(),
  referrerHost: z.string().max(120).nullable(),
  landingPath: z.string().max(200),
  clickId: z.string().max(20).nullable(),
  channel: z.enum(CHANNELS),
  ts: z.number().int().positive(),
  signal: z.boolean(),
});

export const encodeTouch = (t: Touch): string => JSON.stringify(t);

/** Cookie payloads are client-controlled: parse defensively, reject anything off-schema. */
export function decodeTouch(raw: string | null | undefined): Touch | null {
  if (!raw || raw.length > 1200) return null;
  try {
    const r = touchSchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

const BOT_RE =
  /bot|crawl|spider|slurp|headless|lighthouse|pingdom|uptime|monitor|preview|facebookexternalhit|embedly|curl|wget|python-requests|httpclient|go-http|axios|node-fetch|java\/|libwww|scrapy|phantom|selenium|puppeteer|playwright/i;

export function isLikelyBot(userAgent: string | null | undefined): boolean {
  if (!userAgent || userAgent.length < 10) return true;
  return BOT_RE.test(userAgent);
}

/** Do Not Track / Global Privacy Control: if either is on, we record nothing. */
export function trackingAllowed(h: { get(name: string): string | null }): boolean {
  return h.get("dnt") !== "1" && h.get("sec-gpc") !== "1";
}

export const VISITOR_COOKIE = "mps_vid";
export const FIRST_TOUCH_COOKIE = "mps_ft";
export const LAST_TOUCH_COOKIE = "mps_lt";
export const FIRST_TOUCH_DAYS = 90;

export const VISITOR_ID_RE = /^[a-f0-9]{32}$/;

/** `.multipoststudio.online` when on that domain so the marketing site and app share the cookies; host-only elsewhere (localhost, previews). */
export function cookieDomainFor(host: string | null | undefined): string | undefined {
  const h = (host ?? "").split(":")[0].toLowerCase();
  return h === "multipoststudio.online" || h.endsWith(".multipoststudio.online") ? ".multipoststudio.online" : undefined;
}

// ---- UTM link building (admin tool) ---------------------------------------

export type UtmLinkInput = { url: string; source: string; medium: string; campaign: string; term?: string; content?: string };

export type UtmLinkResult = { ok: true; link: string; warnings: string[] } | { ok: false; error: string };

/**
 * Build a tagged URL with the same normalisation the tracker applies, so what
 * an admin builds is exactly what the reports will group by. Existing UTM
 * params on the URL are replaced, other params and the hash are kept.
 */
export function buildUtmLink(i: UtmLinkInput): UtmLinkResult {
  let u: URL;
  try {
    u = new URL(i.url.trim());
  } catch {
    return { ok: false, error: "Enter a full URL, including https://" };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, error: "Only http(s) links can be tracked" };

  const source = canonicalSource(i.source);
  const medium = canonicalMedium(i.medium);
  const campaign = sanitizeValue(i.campaign);
  if (!source) return { ok: false, error: "Source is required (where the link is posted, e.g. google, newsletter)" };
  if (!medium) return { ok: false, error: "Medium is required (the channel type, e.g. cpc, email, social)" };
  if (!campaign) return { ok: false, error: "Campaign is required (e.g. spring_launch)" };

  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) u.searchParams.delete(k);
  u.searchParams.set("utm_source", source);
  u.searchParams.set("utm_medium", medium);
  u.searchParams.set("utm_campaign", campaign);
  const term = sanitizeValue(i.term);
  const content = sanitizeValue(i.content);
  if (term) u.searchParams.set("utm_term", term);
  if (content) u.searchParams.set("utm_content", content);

  const warnings: string[] = [];
  if (source !== (i.source ?? "").trim().toLowerCase()) warnings.push(`Source will be recorded as "${source}".`);
  if (medium !== (i.medium ?? "").trim().toLowerCase()) warnings.push(`Medium will be recorded as "${medium}".`);
  const ch = classifyChannel({ source, medium, referrerHost: null, clickId: null, hasRef: false });
  if (ch === "Other") warnings.push(`This source/medium pair lands in "Other". Common mediums: cpc, email, social, referral, affiliate, display.`);
  return { ok: true, link: u.toString(), warnings };
}

// ---- touch-selection rules --------------------------------------------------

/**
 * First touch: what originally brought the visitor. A visit with no marketing
 * signal ("Direct") is only a placeholder — if the same visitor later arrives
 * through a campaign, the campaign gets the credit rather than "Direct" owning
 * the visitor forever.
 */
export function nextFirstTouch(existing: Touch | null, incoming: Touch): Touch {
  if (!existing) return incoming;
  if (!existing.signal && incoming.signal) return incoming;
  return existing;
}

/** Last touch: the most recent visit that carried a marketing signal; direct return visits never overwrite it. */
export function nextLastTouch(existing: Touch | null, incoming: Touch): Touch {
  if (!existing) return incoming;
  return incoming.signal ? incoming : existing;
}
