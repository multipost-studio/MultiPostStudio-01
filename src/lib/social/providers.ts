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
};

async function json(res: Response) {
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`.slice(0, 300));
  return res.json();
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
    scopes: ["public_profile", "pages_show_list", "pages_manage_posts", "pages_read_engagement"],
    usePKCE: false,
    clientId: () => env.OAUTH_META_CLIENT_ID,
    clientSecret: () => env.OAUTH_META_CLIENT_SECRET,
    identify: async (t) => {
      // First Page the user manages becomes the channel.
      const pages = await json(
        await fetch(`https://graph.facebook.com/v21.0/me/accounts?fields=name,username,access_token&access_token=${t}`),
      );
      const p = pages.data?.[0];
      if (!p) throw new Error("No Facebook Page found for this account");
      return { remoteId: p.id, handle: p.username ?? p.id, displayName: p.name, avatarUrl: undefined };
    },
  },

  instagram: {
    key: "instagram",
    authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    scopes: ["instagram_basic", "instagram_content_publish", "pages_show_list", "business_management"],
    usePKCE: false,
    clientId: () => env.OAUTH_META_CLIENT_ID,
    clientSecret: () => env.OAUTH_META_CLIENT_SECRET,
    identify: async (t) => {
      const pages = await json(
        await fetch(
          `https://graph.facebook.com/v21.0/me/accounts?fields=instagram_business_account{username,name,profile_picture_url}&access_token=${t}`,
        ),
      );
      const ig = pages.data?.find((p: { instagram_business_account?: unknown }) => p.instagram_business_account)
        ?.instagram_business_account;
      if (!ig) throw new Error("No Instagram Business account linked to a Page");
      return {
        remoteId: ig.id,
        handle: ig.username,
        displayName: ig.name ?? ig.username,
        avatarUrl: ig.profile_picture_url,
      };
    },
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
