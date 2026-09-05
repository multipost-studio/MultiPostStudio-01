import { env, appUrl } from "@/lib/env";

/**
 * OAuth registry for file-source integrations (Google Drive/Photos, Dropbox,
 * OneDrive, Canva, ...) — connections a workspace makes to *import media
 * from*, not to publish to. Kept separate from src/lib/social/providers.ts,
 * which carries publish semantics (channels, content types, scopes tied to
 * SocialProviderKey).
 */

export type IntegrationKey = "google_drive";

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
    scopes: ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/userinfo.email"],
    authorizeExtras: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
    // Same Google Cloud project as YouTube — a separate OAuth client isn't
    // required, but Drive needs its own env in case an operator wants to
    // scope it to a different project later.
    clientId: () => env.OAUTH_GOOGLE_DRIVE_CLIENT_ID ?? env.OAUTH_GOOGLE_CLIENT_ID,
    clientSecret: () => env.OAUTH_GOOGLE_DRIVE_CLIENT_SECRET ?? env.OAUTH_GOOGLE_CLIENT_SECRET,
    identify: async (t) => {
      const u = await json(
        await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { authorization: `Bearer ${t}` } }),
      );
      return { displayName: u.name ?? u.email ?? "Google Drive", accountEmail: u.email };
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
