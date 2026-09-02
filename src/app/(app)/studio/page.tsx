import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Studio } from "./studio";

export const metadata: Metadata = { title: "Content Studio" };

export default async function StudioPage() {
  const ctx = await requireWorkspace();
  const channels = await db.socialChannel.findMany({
    where: { workspaceId: ctx.active.workspace.id },
    select: { platform: true },
    distinct: ["platform"],
  });
  const platforms = channels.map((c) => c.platform);

  return (
    <>
      <PageHeader
        title="AI Content Studio"
        description={`Generate on-brand content. Tuned to ${ctx.active.workspace.name}'s Brand Brain.`}
      />
      <Studio platforms={platforms.length ? platforms : ["instagram", "linkedin", "x"]} brandVoice={ctx.active.workspace.brandVoice} />
    </>
  );
}
