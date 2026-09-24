/**
 * Google Drive integration. Uses least-privilege `drive.file` scope in combination
 * with the Google Picker API. Downloads user-selected media assets.
 */
const API = "https://www.googleapis.com/drive/v3";

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  modifiedTime?: string;
  /** Requires the same bearer token to load — proxy it server-side, never render directly in an <img src>. */
  thumbnailLink?: string;
};

export async function listDriveFiles(
  accessToken: string,
  opts: { query?: string; pageToken?: string } = {},
): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
  const filters = ["trashed = false", "(mimeType contains 'image/' or mimeType contains 'video/')"];
  if (opts.query?.trim()) filters.push(`name contains '${opts.query.trim().replace(/'/g, "\\'")}'`);

  const params = new URLSearchParams({
    q: filters.join(" and "),
    fields: "files(id,name,mimeType,size,modifiedTime,thumbnailLink),nextPageToken",
    pageSize: "24",
    orderBy: "modifiedTime desc",
    spaces: "drive",
  });
  if (opts.pageToken) params.set("pageToken", opts.pageToken);

  const res = await fetch(`${API}/files?${params}`, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Drive list ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string };
  return { files: j.files ?? [], nextPageToken: j.nextPageToken };
}

/** Download a file's bytes. Drive requires the bearer token — no public hotlink. */
export async function downloadDriveFile(
  accessToken: string,
  fileId: string,
  maxBytes = 200 * 1024 * 1024,
): Promise<{ buf: Buffer; contentType: string }> {
  const res = await fetch(`${API}/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive download ${res.status}: ${(await res.text()).slice(0, 200)}`);
  // Pre-check Content-Length before buffering — avoids allocating up to 4GB
  // across a 20-file bulk import when the file is already over the cap.
  const announced = Number(res.headers.get("content-length") ?? 0);
  if (Number.isFinite(announced) && announced > maxBytes) {
    try {
      await res.arrayBuffer().catch(() => undefined);
    } catch {
      /* best-effort drain */
    }
    throw new Error(`Drive file too large (${announced} bytes)`);
  }
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  // Hard cap while buffering: Content-Length can lie, so check the real bytes
  // too before they grow unbounded in serverless memory.
  const ab = await res.arrayBuffer();
  if (ab.byteLength > maxBytes) throw new Error(`Drive file too large (${ab.byteLength} bytes)`);
  const buf = Buffer.from(ab);
  return { buf, contentType };
}
