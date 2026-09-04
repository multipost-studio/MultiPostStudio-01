import {
  uploadMediaAction,
  createUploadUrlAction,
  registerMediaAction,
} from "@/app/actions/media";

/**
 * Browser-side media upload used by both the Media Library and the Composer's
 * media picker. Large files (and everything, once object storage is
 * configured) go straight to storage via a presigned PUT, bypassing the
 * serverless body cap; small files fall back to the server action in dev.
 * Video posters are captured in-browser.
 */
export type UploadResult = { okCount: number; firstError?: string; newIds: string[] };

/** Grab a poster frame + dimensions from a video file, entirely in the browser. */
function capturePoster(
  file: File,
): Promise<{ blob: Blob; width: number; height: number; durationSec: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "metadata";
    video.src = url;
    const done = (v: { blob: Blob; width: number; height: number; durationSec: number } | null) => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      resolve(v);
    };
    const fail = () => done(null);
    video.onerror = fail;
    video.onloadeddata = () => {
      video.currentTime = Math.min(1, (video.duration || 2) / 2);
    };
    video.onseeked = () => {
      try {
        const scale = Math.min(1, 720 / (video.videoWidth || 720));
        const w = Math.round((video.videoWidth || 720) * scale);
        const h = Math.round((video.videoHeight || 405) * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const cx = canvas.getContext("2d");
        if (!cx) return fail();
        cx.drawImage(video, 0, 0, w, h);
        canvas.toBlob(
          (blob) =>
            blob
              ? done({
                  blob,
                  width: video.videoWidth,
                  height: video.videoHeight,
                  durationSec: Math.round(video.duration || 0),
                })
              : fail(),
          "image/jpeg",
          0.8,
        );
      } catch {
        fail();
      }
    };
    setTimeout(fail, 15000);
  });
}

/** PUT a blob to storage via a fresh presigned URL; returns its public URL. */
async function putBlob(blob: Blob, filename: string, contentType: string): Promise<string | null> {
  const u = await createUploadUrlAction({ filename, contentType, size: blob.size });
  const presigned = u.ok ? u.data?.presigned : null;
  if (!presigned) return null;
  const put = await fetch(presigned.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
  return put.ok ? presigned.publicUrl : null;
}

export async function uploadFiles(
  files: File[],
  opts: { folderId?: string | null } = {},
): Promise<UploadResult> {
  const folderId = opts.folderId ?? null;
  const smallFallback: File[] = [];
  const newIds: string[] = [];
  let okCount = 0;
  let firstError: string | undefined;

  for (const f of files) {
    const contentType = f.type || "application/octet-stream";
    const u = await createUploadUrlAction({ filename: f.name, contentType, size: f.size });
    if (!u.ok) {
      firstError ??= u.error;
      continue;
    }
    const presigned = u.data?.presigned;
    if (!presigned) {
      smallFallback.push(f);
      continue;
    }
    try {
      const put = await fetch(presigned.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: f,
      });
      if (!put.ok) throw new Error(`storage responded ${put.status}`);

      let thumbUrl: string | null = null;
      let dims: { width: number; height: number; durationSec: number } | null = null;
      if (contentType.startsWith("video/")) {
        const poster = await capturePoster(f);
        if (poster) {
          dims = poster;
          thumbUrl = await putBlob(
            poster.blob,
            f.name.replace(/\.[^.]+$/, "") + ".poster.jpg",
            "image/jpeg",
          );
        }
      }

      const reg = await registerMediaAction({
        key: presigned.key,
        url: presigned.publicUrl,
        filename: f.name,
        contentType,
        sizeBytes: f.size,
        folderId,
        thumbUrl,
        width: dims?.width ?? null,
        height: dims?.height ?? null,
        durationSec: dims?.durationSec ?? null,
      });
      if (reg.ok) {
        okCount++;
        if (typeof reg.data === "string") newIds.push(reg.data);
      } else {
        firstError ??= reg.error;
      }
    } catch (e) {
      firstError ??= e instanceof Error ? e.message : "Upload failed";
    }
  }

  if (smallFallback.length > 0) {
    const fd = new FormData();
    for (const f of smallFallback) fd.append("files", f);
    if (folderId) fd.append("folderId", folderId);
    const res = await uploadMediaAction(fd);
    if (res.ok) okCount += smallFallback.length;
    else firstError ??= res.error;
  }

  return { okCount, firstError, newIds };
}
