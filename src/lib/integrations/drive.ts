/**
 * Google Drive file browsing + download. Read-only (drive.readonly scope).
 *
 * Drive's `thumbnailLink` needs the same bearer token to load and <img> can't
 * attach one, so the picker lists files by name/type/size rather than a
 * visual thumbnail grid — same fallback the Media Library itself uses for
 * non-image assets.
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
export async function downloadDriveFile(accessToken: string, fileId: string): Promise<{ buf: Buffer; contentType: string }> {
  const res = await fetch(`${API}/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive download ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const buf = Buffer.from(await res.arrayBuffer());
  return { buf, contentType };
}
