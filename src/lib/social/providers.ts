import { env, oauthRedirectUri, type SocialProviderKey } from "@/lib/env";

/**
 * OAuth2 provider registry. Real authorization + token endpoints and the
 * identity call used to name the connected account. Publishing lives in
 * src/lib/adapters/publish.ts.
 *
 * A provider is "configured" when its client id + secret env vars are set;
 * until then the integrations UI falls back to manual handle entry.
 */

export type OAuthProvider = {
  key: Exclude<SocialProviderKey, "bluesky">;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  usePKCE: boolean;
  clientId: () => string | undefined;
  clientSecret: () => string | undefined;
  /** extra params on the authorize redirect */
  authorizeExtras?: Record<string, string>;
  /** Fetch { handle, displayName, avatarUrl?, remoteId } for the connected user. */
  identify: (accessToken: string) => Promise<{
    remoteId: string;
    handle: string;
    displayName: string;
    avatarUrl?: string;
  }>;
  /**
   * Optional: turn the raw code-exchange token into what we actually store.
   * Meta needs this — swap the short-lived user token for a long-lived one,
   * then resolve the Page access token (+ linked IG business account id).
   * When present, its result overrides the default token/metadata/expiry.
   */
  finalize?: (userAccessToken: string) => Promise<{
    accessToken: string;
    metadata: Record<string, unknown>;
    expiresAt: Date | null;
    handle?: string;
    displayName?: string;
    avatarUrl?: string;
  }>;
};

async function json(res: Response) {
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`.slice(0, 300));
  return res.json();
}

const GRAPH = "https://graph.facebook.com/v21.0";

/**
 * Meta: short-lived user token -> long-lived user token (~60d) -> the Page
 * access token (which doesn't expire while the user token is valid) plus the
 * linked Instagram business account id. `wantInstagram` requires the IG link.
 */
async function metaFinalize(userAccessToken: string, wantInstagram: boolean) {
  const ll = await json(
    await fetch(
      `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${env.OAUTH_META_CLIENT_ID}` +
        `&client_secret=${env.OAUTH_META_CLIENT_SECRET}&fb_exchange_token=${userAccessToken}`,
    ),
  );
  const longLived: string = ll.access_token;

  const pages = await json(
    await fetch(
      `${GRAPH}/me/accounts?fields=name,username,access_token,` +
        `picture{url},instagram_business_account{id,username,name,profile_picture_url}&access_token=${longLived}`,
    ),
  );
  type Page = {
    id: string;
    name: string;
    username?: string;
    access_token: string;
    picture?: { data?: { url?: string } };
    instagram_business_account?: { id: string; username: string; name?: string; profile_picture_url?: string };
  };
  const list: Page[] = pages.data ?? [];
  const page = wantInstagram ? list.find((p) => p.instagram_business_account) : list[0];
  if (!page) {
    throw new Error(
      wantInstagram
        ? "No Instagram business account linked to a Facebook Page you manage."
        : "No Facebook Page found for this account.",
    );
  }

  if (wantInstagram) {
    const ig = page.instagram_business_account!;
    return {
      accessToken: page.access_token, // page token drives IG publishing too
      metadata: { remoteId: ig.id, pageId: page.id, pageToken: page.access_token },
      expiresAt: null,
      handle: `@${ig.username}`,
      displayName: ig.name ?? ig.username,
      avatarUrl: ig.profile_picture_url,
    };
  }
  return {
    accessToken: page.access_token,
    metadata: { remoteId: page.id, pageId: page.id },
    expiresAt: null,
    handle: page.username ? `@${page.username}` : page.id,
    displayName: page.name,
    avatarUrl: page.picture?.data?.url,
  };
}

export const PROVIDERS: Partial<Record<SocialProviderKey, OAuthProvider>> = {
  linkedin: {
    key: "linkedin",
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: ["openid", "profile", "w_member_social"],
    usePKCE: false,
    clientId: () => env.OAUTH_LINKEDIN_CLIENT_ID,
    clientSecret: () => env.OAUTH_LINKEDIN_CLIENT_SECRET,
    identify: async (t) => {
      const u = await json(
        await fetch("https://api.linkedin.com/v2/userinfo", { headers: { authorization: `Bearer ${t}` } }),
      );
      return {
        remoteId: u.sub,
        handle: u.email ?? u.sub,
        displayName: u.name ?? "LinkedIn member",
        avatarUrl: u.picture,
      };
    },
  },

  facebook: {
    key: "facebook",
    authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    scopes: [
      "public_profile",
      "pages_show_list",
      "pages_manage_posts",
      "pages_read_engagement",
      "pages_manage_engagement",
      "read_insights",
    ],
    usePKCE: false,
    clientId: () => env.OAUTH_META_CLIENT_ID,
    clientSecret: () => env.OAUTH_META_CLIENT_SECRET,
    // identify is unused when finalize is present, but kept for the type + as a probe.
    identify: async (t) => {
      const pages = await json(await fetch(`${GRAPH}/me/accounts?fields=name,username&access_token=${t}`));
      const p = pages.data?.[0];
      if (!p) throw new Error("No Facebook Page found for this account");
      return { remoteId: p.id, handle: p.username ?? p.id, displayName: p.name };
    },
    finalize: (t) => metaFinalize(t, false),
  },

  instagram: {
    key: "instagram",
    authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    scopes: [
      "instagram_basic",
      "instagram_content_publish",
      "instagram_manage_comments",
      "instagram_manage_insights",
      "pages_show_list",
      "business_management",
    ],
    usePKCE: false,
    clientId: () => env.OAUTH_META_CLIENT_ID,
    clientSecret: () => env.OAUTH_META_CLIENT_SECRET,
    identify: async (t) => {
      const pages = await json(
        await fetch(`${GRAPH}/me/accounts?fields=instagram_business_account{id,username,name}&access_token=${t}`),
      );
      const ig = pages.data?.find((p: { instagram_business_account?: unknown }) => p.instagram_business_account)
        ?.instagram_business_account;
      if (!ig) throw new Error("No Instagram Business account linked to a Page");
      return { remoteId: ig.id, handle: `@${ig.username}`, displayName: ig.name ?? ig.username };
    },
    finalize: (t) => metaFinalize(t, true),
  },

  x: {
    key: "x",
    authorizeUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    usePKCE: true,
    clientId: () => env.OAUTH_X_CLIENT_ID,
    clientSecret: () => env.OAUTH_X_CLIENT_SECRET,
    identify: async (t) => {
      const u = await json(
        await fetch("https://api.twitter.com/2/users/me?user.fields=profile_image_url", {
          headers: { authorization: `Bearer ${t}` },
        }),
      );
      return {
        remoteId: u.data.id,
        handle: `@${u.data.username}`,
        displayName: u.data.name,
        avatarUrl: u.data.profile_image_url,
      };
    },
  },

  pinterest: {
    key: "pinterest",
    authorizeUrl: "https://www.pinterest.com/oauth/",
    tokenUrl: "https://api.pinterest.com/v5/oauth/token",
    scopes: ["boards:read", "pins:read", "pins:write", "user_accounts:read"],
    usePKCE: false,
    clientId: () => env.OAUTH_PINTEREST_CLIENT_ID,
    clientSecret: () => env.OAUTH_PINTEREST_CLIENT_SECRET,
    identify: async (t) => {
      const u = await json(
        await fetch("https://api.pinterest.com/v5/user_account", { headers: { authorization: `Bearer ${t}` } }),
      );
      return { remoteId: u.username, handle: `@${u.username}`, displayName: u.username, avatarUrl: u.profile_image };
    },
  },
};

export function getProvider(platform: string): OAuthProvider | null {
  const p = PROVIDERS[platform as SocialProviderKey];
  if (!p) return null;
  return p.clientId() && p.clientSecret() ? p : null;
}

export { oauthRedirectUri };
