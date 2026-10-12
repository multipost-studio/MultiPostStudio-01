import { db } from "@/lib/db";
import { isProduction } from "@/lib/env";
import { isRealToken } from "@/lib/social/crypto";

/**
 * Accounts the app calls "Connected" that cannot actually publish: the saved login is a placeholder, was cleared, or can
 * no longer be decrypted (for example after TOKEN_ENC_KEY changed). The publish worker refuses these in production with
 * "isn't connected with real credentials", so the Integrations page must say so too instead of showing a green badge.
 *
 * Tokens are read here and never returned: callers get only ids. `configProblem` is true when the server cannot decrypt
 * anything at all (the encryption key is missing or malformed), which needs the deployment fixed, not the accounts.
 * Outside production, placeholder accounts are legitimate demos, so nothing is reported.
 */
export async function accountsNeedingReconnect(workspaceId: string): Promise<{ ids: Set<string>; configProblem: boolean }> {
  const ids = new Set<string>();
  if (!isProduction) return { ids, configProblem: false };
  const rows = await db.socialAccount.findMany({
    where: { workspaceId, status: "connected" },
    select: { id: true, accessToken: true },
  });
  for (const r of rows) {
    try {
      if (!isRealToken(r.accessToken)) ids.add(r.id);
    } catch {
      return { ids: new Set(), configProblem: true };
    }
  }
  return { ids, configProblem: false };
}
