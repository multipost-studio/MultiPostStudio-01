"use server";

import { db } from "@/lib/db";
import { refreshIntegrationIfNeeded } from "@/lib/integrations/oauth";
import { createDesign, editUrlWithCorrelation } from "@/lib/integrations/canva";
import { resolveFolderId } from "@/lib/media-types";
import { withPermission, ok, fail } from "./_helpers";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

async function canvaAccount(workspaceId: string) {
  return db.connectedIntegration.findUnique({
    where: { workspaceId_provider: { workspaceId, provider: "canva" } },
  });
}

const SIZES: Record<string, { width: number; height: number }> = {
  instagram_post: { width: 1080, height: 1080 },
  instagram_story: { width: 1080, height: 1920 },
  facebook_post: { width: 1200, height: 630 },
  linkedin_post: { width: 1200, height: 1200 },
  pinterest_pin: { width: 1000, height: 1500 },
  x_post: { width: 1600, height: 900 },
};

export async function createCanvaDesignAction(input: { size: keyof typeof SIZES; folderId?: string | null; returnTo?: string | null }) {
  const ctx = await withPermission("media.manage");
  const dims = SIZES[input.size];
  if (!dims) return fail("Unknown size");
  // App-relative path only — this gets used as a redirect target in the
  // Return Navigation route, so anything else (an absolute URL, a
  // protocol-relative "//evil.com") would be an open redirect.
  const returnTo = input.returnTo && /^\/(?!\/)/.test(input.returnTo) ? input.returnTo.slice(0, 300) : null;
  try {
    // 10 new designs/hour/user — each is a real Canva API call, not free on their side either.
    await enforceRateLimit(`canva-create:${ctx.user.id}`, 10, 3_600_000);
  } catch (e) {
    if (e instanceof RateLimitError) return fail(e.message);
    throw e;
  }

  const account = await canvaAccount(ctx.active.workspace.id);
  if (!account) return fail("Connect Canva first (Integrations page).");
  const token = await refreshIntegrationIfNeeded(account.id);
  if (!token) return fail("Canva session expired — reconnect it.");

  const folderId = input.folderId ? await resolveFolderId(ctx.active.workspace.id, input.folderId) : null;

  let design: { id: string; editUrl: string };
  try {
    design = await createDesign(token, dims.width, dims.height);
  } catch (e) {
    logger.warn({ err: e }, "canva design create failed");
    return fail("Couldn't create a Canva design");
  }

  const session = await db.canvaDesignSession.create({
    data: {
      workspaceId: ctx.active.workspace.id,
      userId: ctx.user.id,
      folderId,
      designId: design.id,
      returnTo,
    },
  });

  return ok({ editUrl: editUrlWithCorrelation(design.editUrl, session.id) });
}
