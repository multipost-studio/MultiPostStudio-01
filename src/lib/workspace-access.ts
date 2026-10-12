import { canOpenWorkspace } from "@/lib/rbac";

type WorkspaceLite = { id: string; restricted: boolean };
type RowLite = { workspaceId: string; userId: string };
type MemberLite = { userId: string; role: string };

/**
 * Members who could not open ANY workspace of the org. Restricting a workspace, or taking someone off one, must never
 * produce such a person: the app has nowhere to put them, so they would be bounced to onboarding while still belonging
 * to the org. Owners and admins always have access, so they never appear here.
 */
export function membersWithoutAnyWorkspace(workspaces: WorkspaceLite[], rows: RowLite[], members: MemberLite[]): string[] {
  const rowSet = new Set(rows.map((r) => `${r.workspaceId}:${r.userId}`));
  return members
    .filter((m) => !workspaces.some((w) => canOpenWorkspace(m.role, w.restricted, rowSet.has(`${w.id}:${m.userId}`))))
    .map((m) => m.userId);
}
