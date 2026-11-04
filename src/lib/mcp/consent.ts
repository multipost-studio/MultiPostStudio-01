import { effectiveRole, permissionSet } from "@/lib/rbac";
import type { ActiveContext } from "@/lib/session";

/** One choice on the consent screen: a single workspace, or every workspace of an organisation. */
export type GrantTarget = { value: string; orgId: string; orgName: string; workspaceId: string | null; label: string };

const PERMISSION = "integrations.manage" as const; // the same permission that creates an API key

/**
 * What this person may connect an assistant to: only places where they could also create an API key (owners and admins by default).
 * "All workspaces" needs that permission at organisation level; a single workspace needs it in that workspace.
 */
export function grantTargets(workspaces: ActiveContext["workspaces"]): GrantTarget[] {
  const out: GrantTarget[] = [];
  const seenOrgs = new Set<string>();
  for (const w of workspaces) {
    if (!seenOrgs.has(w.org.id)) {
      seenOrgs.add(w.org.id);
      if (permissionSet(w.orgRole, w.customPerms).has(PERMISSION)) {
        out.push({ value: `org:${w.org.id}`, orgId: w.org.id, orgName: w.org.name, workspaceId: null, label: `All workspaces in ${w.org.name}` });
      }
    }
    if (permissionSet(effectiveRole(w.orgRole, w.workspaceRole), w.customPerms).has(PERMISSION)) {
      out.push({ value: `ws:${w.workspace.id}`, orgId: w.org.id, orgName: w.org.name, workspaceId: w.workspace.id, label: `${w.workspace.name} only (${w.org.name})` });
    }
  }
  return out;
}

/** Find the target the form named, only among those this person is allowed to grant. */
export function pickTarget(targets: GrantTarget[], value: unknown): GrantTarget | null {
  return typeof value === "string" ? (targets.find((t) => t.value === value) ?? null) : null;
}
