import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { IdeasBoard } from "./board";

export const metadata: Metadata = { title: "Ideas" };

export default async function IdeasPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const ctx = await requireWorkspace();
  const wsId = ctx.active.workspace.id;
  const { new: openNew } = await searchParams;

  const [ideas, pillars, campaigns] = await Promise.all([
    db.contentIdea.findMany({
      where: { workspaceId: wsId, archivedAt: null },
      orderBy: [{ stage: "asc" }, { sortIndex: "asc" }],
      include: { author: { select: { name: true } }, pillar: true, tags: { include: { tag: true } } },
    }),
    db.contentPillar.findMany({ where: { workspaceId: wsId } }),
    db.campaign.findMany({ where: { workspaceId: wsId }, orderBy: { name: "asc" } }),
  ]);

  return (
    <IdeasBoard
      ideas={ideas.map((i) => ({
        id: i.id,
        title: i.title,
        notes: i.notes,
        kind: i.kind,
        url: i.url,
        stage: i.stage,
        sortIndex: i.sortIndex,
        author: i.author.name,
        pillar: i.pillar ? { name: i.pillar.name, color: i.pillar.color } : null,
        tags: i.tags.map((t) => t.tag.name),
      }))}
      pillars={pillars.map((p) => ({ id: p.id, name: p.name }))}
      campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
      canEdit={can(ctx.active.role, "content.create")}
      openNew={openNew === "1"}
    />
  );
}
