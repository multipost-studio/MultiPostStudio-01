import {
  siBluesky,
  siDiscord,
  siFacebook,
  siGithub,
  siInstagram,
  siMastodon,
  siMedium,
  siPinterest,
  siProducthunt,
  siReddit,
  siSnapchat,
  siTelegram,
  siThreads,
  siTiktok,
  siTwitch,
  siWhatsapp,
  siX,
  siYoutube,
} from "simple-icons";

/**
 * Icons an admin can pick for a footer link. Brand marks come from the
 * `simple-icons` package (CC0). LinkedIn is not in that package any more, so its
 * glyph is kept here. The generic kinds (email, website, feed, phone) are drawn
 * by the footer with the app's own icon set.
 */
export type GenericIcon = "email" | "website" | "rss" | "phone";

export const SOCIAL_ICON_IDS = [
  "facebook", "instagram", "x", "linkedin", "youtube", "tiktok", "threads", "pinterest", "bluesky",
  "github", "discord", "telegram", "whatsapp", "reddit", "mastodon", "medium", "producthunt", "snapchat", "twitch",
  "email", "website", "rss", "phone",
] as const;
export type SocialIconId = (typeof SOCIAL_ICON_IDS)[number];

const LINKEDIN_PATH =
  "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z";

type IconDef = { label: string; path?: string; generic?: GenericIcon };

export const SOCIAL_ICONS: Record<SocialIconId, IconDef> = {
  facebook: { label: "Facebook", path: siFacebook.path },
  instagram: { label: "Instagram", path: siInstagram.path },
  x: { label: "X (Twitter)", path: siX.path },
  linkedin: { label: "LinkedIn", path: LINKEDIN_PATH },
  youtube: { label: "YouTube", path: siYoutube.path },
  tiktok: { label: "TikTok", path: siTiktok.path },
  threads: { label: "Threads", path: siThreads.path },
  pinterest: { label: "Pinterest", path: siPinterest.path },
  bluesky: { label: "Bluesky", path: siBluesky.path },
  github: { label: "GitHub", path: siGithub.path },
  discord: { label: "Discord", path: siDiscord.path },
  telegram: { label: "Telegram", path: siTelegram.path },
  whatsapp: { label: "WhatsApp", path: siWhatsapp.path },
  reddit: { label: "Reddit", path: siReddit.path },
  mastodon: { label: "Mastodon", path: siMastodon.path },
  medium: { label: "Medium", path: siMedium.path },
  producthunt: { label: "Product Hunt", path: siProducthunt.path },
  snapchat: { label: "Snapchat", path: siSnapchat.path },
  twitch: { label: "Twitch", path: siTwitch.path },
  email: { label: "Email", generic: "email" },
  website: { label: "Website", generic: "website" },
  rss: { label: "RSS feed", generic: "rss" },
  phone: { label: "Phone", generic: "phone" },
};
