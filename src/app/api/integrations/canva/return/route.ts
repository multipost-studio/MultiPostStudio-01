import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getIntegrationProvider } from "@/lib/integrations/providers";
import { refreshIntegrationIfNeeded } from "@/lib/integrations/oauth";
import { verifyCorrelationJwt, exportDesignAndWait, downloadExport } from "@/lib/integrations/canva";
import { saveUpload } from "@/lib/adapters/storage";
import { generateAltText } from "@/lib/adapters/ai";
import { bumpUsage } from "@/lib/adapters/billing";
import { ALLOWED_MIME_TYPES, kindFor } from "@/lib/media-types";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

const STORAGE_CAP_BYTES = Math.floor(9.5 * 1024 * 1024 * 1024);
const MAX_IMPORT_BYTES = 200 * 1024 * 1024;

/**
 * Canva's "Return Navigation" URL — configured as a single static URL in
 * the Canva Developer Portal (Outside Canva > Configuration > Return
 * navigation), not requested dynamically per session like every other
 * OAuth redirect_uri in this codebase. Canva appends a signed
 * correlation_jwt identifying the design and echoing back the
 * correlation_state we set on the edit URL (see actions/canva.ts) — that's
 * looked up against CanvaDesignSession to recover which workspace/folder
 * started the design and where to send the user back to.
 *
 * See docs.canva.dev "Return users to your platform" for the full shape —
 * verified against Canva's live docs while building this, not guessed.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const jwt = url.searchParams.get("correlation_jwt");
  const fallback = new URL("/media", req.url);

  const provider = getIntegrationProvider("canva");
  if (!jwt || !provider) {
    fallback.searchParams.set("error", "canva-return-invalid");
    return NextResponse.redirect(fallback);
  }

  const claims = await verifyCorrelationJwt(jwt, provider.clientId()!);
  if (!claims) {
    fallback.searchParams.set("error", "canva-return-invalid");
    return NextResponse.redirect(fallback);
  }

  const session = await db.canvaDesignSession.findUnique({ where: { id: claims.correlation_state } });
  if (!session) {
    fallback.searchParams.set("error", "canva-session-expired");
    return NextResponse.redirect(fallback);
  }
  // Single-use: whether this succeeds or fails below, the session is spent —
  // never let the same correlation_state be replayed.
  await db.canvaDesignSession.delete({ where: { id: session.id } }).catch(() => {});

  const back = new URL(session.returnTo && /^\/(?!\/)/.test(session.returnTo) ? session.returnTo : "/media", req.url);

  const account = await db.connectedIntegration.findUnique({
    where: { workspaceId_provider: { workspaceId: session.workspaceId, provider: "canva" } },
  });
  if (!account) {
    back.searchParams.set("error", "canva-not-connected");
    return NextResponse.redirect(back);
  }
  const token = await refreshIntegrationIfNeeded(account.id);
  if (!token) {
    back.searchParams.set("error", "canva-session-expired");
    return NextResponse.redirect(back);
  }

  const designId = session.designId ?? claims.design_id;

  try {
    const exportUrl = await exportDesignAndWait(token, designId, "png");
    const file = await downloadExport(exportUrl);

    if (file.buf.length > MAX_IMPORT_BYTES) throw new Error("export too large");
    const usedBytes = Number((await db.mediaAsset.aggregate({ _sum: { sizeBytes: true } }))._sum.sizeBytes ?? 0);
    if (usedBytes + file.buf.length > STORAGE_CAP_BYTES) throw new Error("storage full");

    const contentType = file.contentType.toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(contentType)) throw new Error("unsupported export type");
    const kind = kindFor(contentType);
    if (kind === "document") throw new Error("unsupported export kind");

    const filename = `canva-design-${designId}.png`;
    const saved = await saveUpload(new File([new Uint8Array(file.buf)], filename, { type: file.contentType }));
    const asset = await db.mediaAsset.create({
      data: {
        workspaceId: session.workspaceId,
        folderId: session.folderId,
        uploaderId: session.userId,
        kind,
        url: saved.url,
        thumbUrl: saved.url,
        filename: saved.filename,
        mimeType: saved.mimeType,
        sizeBytes: saved.sizeBytes,
        altText: generateAltText({ filename: saved.filename }),
        aiDescription: "Created in Canva",
        hash: `canva-${designId}`,
      },
    });
    const org = await db.workspace.findUnique({ where: { id: session.workspaceId }, select: { orgId: true } });
    if (org) await bumpUsage(org.orgId, "storage_mb", Math.ceil(saved.sizeBytes / (1024 * 1024)));

    back.searchParams.set("imported", asset.id);
    return NextResponse.redirect(back);
  } catch (e) {
    logger.warn({ err: e, designId }, "canva export/import failed");
    back.searchParams.set("error", "canva-import-failed");
    return NextResponse.redirect(back);
  }
}
