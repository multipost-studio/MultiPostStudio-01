import { NextResponse, type NextRequest } from "next/server";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { isOwnStorageUrl } from "@/lib/adapters/storage";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Same-origin copy of an image asset, for the image editor.
 *
 * The editor draws the picture onto a canvas and exports it. Bucket hosts
 * (R2/S3/Supabase) rarely send CORS headers, so a cross-origin load with
 * `crossOrigin="anonymous"` fails and the editor sat on "Loading image…"
 * forever; without it the canvas is tainted and Save throws. Serving the bytes
 * from our own origin fixes both.
 *
 * Only assets in the caller's active workspace are served, and only from our
 * own configured storage host, so this cannot be pointed at an arbitrary URL.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireWorkspace();
  const asset = await db.mediaAsset.findFirst({
    where: { id, workspaceId: ctx.active.workspace.id, kind: "image" },
    select: { url: true, mimeType: true },
  });
  if (!asset || !isOwnStorageUrl(asset.url)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  try {
    const upstream = await fetch(asset.url, { redirect: "error", signal: AbortSignal.timeout(15_000) });
    if (!upstream.ok) return NextResponse.json({ error: "upstream failed" }, { status: 502 });
    const len = Number(upstream.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) return NextResponse.json({ error: "too large" }, { status: 413 });
    const buf = await upstream.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return NextResponse.json({ error: "too large" }, { status: 413 });
    return new NextResponse(buf, {
      headers: {
        "content-type": asset.mimeType.startsWith("image/") ? asset.mimeType : "application/octet-stream",
        "cache-control": "private, max-age=300",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    logger.warn({ err, assetId: id }, "media raw proxy failed");
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
}
