import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { parseJson } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui/misc";
import { TmplNew, TmplList } from "./templates-client";

export const metadata: Metadata = { title: "Templates" };

export default async function TemplatesPage() {
  const ctx = await requireWorkspace();
  const templates = await db.template.findMany({
    where: { workspaceId: ctx.active.workspace.id },
    orderBy: { createdAt: "desc" },
  });
  const canEdit = can(ctx.active.role, "content.create");

  return (
    <>
      <PageHeader
        title="Templates"
        description="Reusable post structures. Start a draft from one in a click."
        actions={canEdit && <TmplNew />}
      />
      {templates.length === 0 ? (
        <EmptyState
          title="No templates yet"
          description="Save your best-performing post structures so anyone can reuse them."
          action={canEdit && <TmplNew />}
        />
      ) : (
        <TmplList
          canEdit={canEdit}
          templates={templates.map((t) => ({
            id: t.id,
            name: t.name,
            category: t.category,
            body: t.body,
            platforms: parseJson<string[]>(t.platforms, []),
          }))}
        />
      )}
    </>
  );
}
