import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { BrandVoiceBuilder } from "./voice-builder";

export const metadata: Metadata = { title: "Brand Voice Builder" };

export default async function BrandVoicePage() {
  const ctx = await requireWorkspace();
  const ws = ctx.active.workspace;
  const canManage = can(ctx.active.role, "workspace.manage");

  const fullWs = await db.workspace.findUnique({
    where: { id: ws.id },
    select: {
      brandVoice: true,
      brandTones: true,
      brandPreferences: true,
      _count: {
        select: { brandSources: true },
      },
    },
  });

  let initialTones: Record<string, string> = {};
  let initialPreferences: {
    vocabulary?: string[];
    avoidWords?: string[];
    emojiStyle?: string;
    ctaStyle?: string;
    hashtagStrategy?: string;
  } = {};

  try {
    if (fullWs?.brandTones) {
      initialTones = JSON.parse(fullWs.brandTones);
    }
    if (fullWs?.brandPreferences) {
      initialPreferences = JSON.parse(fullWs.brandPreferences);
    }
  } catch {}

  return (
    <div className="space-y-6">
      <BrandVoiceBuilder
        initialVoice={fullWs?.brandVoice || ""}
        initialTones={initialTones}
        initialPreferences={initialPreferences}
        sourcesCount={fullWs?._count.brandSources || 0}
        canManage={canManage}
      />
    </div>
  );
}
