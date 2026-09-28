import { env, appUrl } from "@/lib/env";

/**
 * OAuth registry for file-source integrations (Google Drive/Photos, Dropbox,
 * OneDrive, Canva, ...) — connections a workspace makes to *import media
 * from*, not to publish to. Kept separate from src/lib/social/providers.ts,
 * which carries publish semantics (channels, content types, scopes tied to
 * SocialProviderKey).
 */

export type IntegrationKey = "google_drive" | "dropbox" | "onedrive";

export type IntegrationProvider = {
  key: IntegrationKey;
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  authorizeExtras?: Record<string, string>;
  clientId: () => string | undefined;
  clientSecret: () => string | undefined;
  identify: (accessToken: string) => Promise<{ displayName: string; accountEmail?: string }>;
};

async function json(res: Response) {
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`.slice(0, 300));
  return res.json();
}

export const INTEGRATION_PROVIDERS: Partial<Record<IntegrationKey, IntegrationProvider>> = {
  google_drive: {
    key: "google_drive",
    label: "Google Drive",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/userinfo.email"],
    // access_type=offline + prompt=consent so Google returns a refresh token
    // AND re-shows the consent screen every time; select_account also forces
    // the account chooser so reconnecting never silently reuses whichever
    // Google account was used last (see revokeIntegrationAtProvider in
    // lib/integrations/oauth.ts for the other half — actually revoking the
    // grant on disconnect, not just re-asking for it on reconnect).
    // NOTE: no include_granted_scopes here on purpose. Drive uses its own
    // dedicated OAuth client (OAUTH_GOOGLE_DRIVE_*) and requests exactly
    // drive.file + userinfo.email. Incremental auth would union scopes
    // granted to a shared client (e.g. YouTube scopes) into this request.
    authorizeExtras: { access_type: "offline", prompt: "select_account consent" },
    // Uses Google's recommended least-privilege `drive.file` scope in combination
    // with the Google Picker API. Drive access is strictly limited to files
    // explicitly selected by the user. Dedicated OAuth client
    // (OAUTH_GOOGLE_DRIVE_*) — NEVER shared with YouTube social publishing
    // (OAUTH_GOOGLE_CLIENT_*) or user login (AUTH_GOOGLE_*). Sharing a client
    // lets Google inherit scopes across integrations and it rejects the
    // combined YouTube + drive.file request. Missing creds fail closed via
    // getIntegrationProvider() returning null.
    clientId: () => env.OAUTH_GOOGLE_DRIVE_CLIENT_ID,
    clientSecret: () => env.OAUTH_GOOGLE_DRIVE_CLIENT_SECRET,
    identify: async (t) => {
      const u = await json(
        await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { authorization: `Bearer ${t}` } }),
      );
      return { displayName: u.name ?? u.email ?? "Google Drive", accountEmail: u.email };
    },
  },

  dropbox: {
    key: "dropbox",
    label: "Dropbox",
    authorizeUrl: "https://www.dropbox.com/oauth2/authorize",
    tokenUrl: "https://api.dropboxapi.com/oauth2/token",
    scopes: ["files.metadata.read", "files.content.read", "account_info.read"],
    // token_access_type=offline is Dropbox's equivalent of Google's
    // access_type=offline — without it the token exchange never returns a
    // refresh_token and the connection dies after a few hours.
    authorizeExtras: { token_access_type: "offline" },
    clientId: () => env.OAUTH_DROPBOX_CLIENT_ID,
    clientSecret: () => env.OAUTH_DROPBOX_CLIENT_SECRET,
    identify: async (t) => {
      const u = await json(
        await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
          method: "POST",
          headers: { authorization: `Bearer ${t}`, "content-type": "application/json" },
          body: "null",
        }),
      );
      return { displayName: u.name?.display_name ?? "Dropbox account", accountEmail: u.email };
    },
  },

  onedrive: {
    key: "onedrive",
    label: "OneDrive",
    // "common" accepts both personal Microsoft accounts and work/school
    // accounts — Files.Read works for either without picking a tenant.
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    // offline_access is the refresh-token scope here (Microsoft's equivalent
    // of Google's access_type=offline / Dropbox's token_access_type=offline).
    scopes: ["Files.Read", "User.Read", "offline_access"],
    clientId: () => env.OAUTH_ONEDRIVE_CLIENT_ID,
    clientSecret: () => env.OAUTH_ONEDRIVE_CLIENT_SECRET,
    identify: async (t) => {
      const u = await json(
        await fetch("https://graph.microsoft.com/v1.0/me", { headers: { authorization: `Bearer ${t}` } }),
      );
      return { displayName: u.displayName ?? "OneDrive account", accountEmail: u.mail ?? u.userPrincipalName };
    },
  },
};

export function getIntegrationProvider(key: string): IntegrationProvider | null {
  const p = INTEGRATION_PROVIDERS[key as IntegrationKey];
  if (!p) return null;
  return p.clientId() && p.clientSecret() ? p : null;
}

export function integrationRedirectUri(provider: string): string {
  return appUrl(`/api/integrations/${provider}/callback`);
}
