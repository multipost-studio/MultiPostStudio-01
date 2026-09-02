import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { can } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { INDUSTRIES } from "@/lib/constants";
import { NewWorkspaceForm } from "./form";

export const metadata: Metadata = { title: "New workspace" };

export default async function NewWorkspacePage() {
  const ctx = await requireWorkspace();
  if (!can(ctx.active.role, "workspace.create")) redirect("/settings/workspace");

  return (
    <div className="max-w-lg">
      <h1 className="text-[19px] font-semibold text-[var(--text)]">Create a workspace</h1>
      <p className="mt-1 text-[14px] text-[var(--text-muted)]">
        Each workspace has its own brand, channels, team and content — perfect for a new brand or client.
      </p>
      <div className="mt-5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
        <NewWorkspaceForm industries={INDUSTRIES} />
      </div>
    </div>
  );
}
