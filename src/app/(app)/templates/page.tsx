import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { parseJson } from "@/lib/utils";
import { PRESET_TEMPLATES } from "@/lib/preset-templates";
import { PageHeader } from "@/components/page-header";
import { TmplNew, TmplList } from "./templates-client";

export const metadata: Metadata = { title: "Templates" };

export default async function TemplatesPage() {
  const ctx = await requireWorkspace();
  const templates = await db.template.findMany({
    where: { workspaceId: ctx.active.workspace.id },
    orderBy: { createdAt: "desc" },
  });
  const canEdit = can(ctx.active.role, "content.create");

  const presetItems = PRESET_TEMPLATES.map((t) => ({
    id: t.slug,
    name: t.name,
    category: t.category,
    body: t.body,
    platforms: t.platforms,
    preset: true,
  }));
  const ownItems = templates.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    body: t.body,
    platforms: parseJson<string[]>(t.platforms, []),
  }));

  return (
    <>
      <PageHeader
        title="Templates"
        description="Reusable post structures. Start a draft from one in a click."
        actions={canEdit && <TmplNew />}
      />

      {ownItems.length > 0 && (
        <>
          <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
            Your templates
          </p>
          <TmplList canEdit={canEdit} templates={ownItems} />
        </>
      )}

      <p className="mb-2 mt-6 text-[13px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
        Starter templates
      </p>
      <TmplList canEdit={canEdit} templates={presetItems} />
    </>
  );
}
