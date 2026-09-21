import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { ClientDetailView } from "./client-detail-view";

export const metadata: Metadata = { title: "Client Workspace Detail" };

export default async function AgencyClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireWorkspace();
  if (ctx.active.org.type !== "agency" || !can(ctx.active.role, "agency.manage")) {
    redirect("/dashboard");
  }

  const { id } = await params;

  const targetWorkspace = await db.workspace.findFirst({
    where: { id, orgId: ctx.active.org.id, archived: false },
    include: {
      portalLinks: {
        where: { revokedAt: null },
        orderBy: { createdAt: "desc" },
      },
      _count: {
        select: {
          posts: true,
          conversations: true,
        },
      },
    },
  });

  if (!targetWorkspace) {
    notFound();
  }

  const portalLinksData = targetWorkspace.portalLinks.map((l) => ({
    id: l.id,
    label: l.label,
    token: l.token,
    logoUrl: l.logoUrl,
    primaryColor: l.primaryColor,
    expiresAt: l.expiresAt ? l.expiresAt.toISOString() : null,
    createdAt: l.createdAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-6xl py-4">
      <ClientDetailView
        workspace={{
          id: targetWorkspace.id,
          name: targetWorkspace.name,
          clientName: targetWorkspace.clientName,
          industry: targetWorkspace.industry,
          kind: targetWorkspace.kind,
          postCount: targetWorkspace._count.posts,
          conversationCount: targetWorkspace._count.conversations,
        }}
        portalLinks={portalLinksData}
      />
    </div>
  );
}
