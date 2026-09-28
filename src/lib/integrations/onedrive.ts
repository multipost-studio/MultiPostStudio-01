/**
 * OneDrive integration via Microsoft Graph. Files.Read grants normal folder
 * access to the signed-in account's drive (personal or work/school), same
 * shape as Dropbox — no picker-only restriction like Google Drive's
 * drive.file.
 */

const GRAPH = "https://graph.microsoft.com/v1.0";

export type OneDriveFile = {
  id: string;
  name: string;
  size?: number;
  modifiedTime?: string;
  isVideo: boolean;
};

async function json(res: Response) {
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`.slice(0, 300));
  return res.json();
}

export async function listOneDriveFiles(accessToken: string, folderId?: string): Promise<{ files: OneDriveFile[] }> {
  const path = folderId ? `/me/drive/items/${encodeURIComponent(folderId)}/children` : "/me/drive/root/children";
  const params = new URLSearchParams({
    $select: "id,name,size,lastModifiedDateTime,file,folder",
    $top: "100",
  });
  const j = await json(await fetch(`${GRAPH}${path}?${params}`, { headers: { authorization: `Bearer ${accessToken}` } }));
  type Item = { id: string; name: string; size?: number; lastModifiedDateTime?: string; file?: { mimeType?: string } };
  const items: Item[] = j.value ?? [];
  const files = items
    .filter((it) => it.file?.mimeType?.startsWith("image/") || it.file?.mimeType?.startsWith("video/"))
    .map((it) => ({
      id: it.id,
      name: it.name,
      size: it.size,
      modifiedTime: it.lastModifiedDateTime,
      isVideo: !!it.file?.mimeType?.startsWith("video/"),
    }));
  return { files };
}

/** Medium thumbnail URL, or null. The URL itself is pre-signed — fetch it with no auth header. */
export async function oneDriveThumbnailUrl(accessToken: string, itemId: string): Promise<string | null> {
  const res = await fetch(`${GRAPH}/me/drive/items/${encodeURIComponent(itemId)}/thumbnails`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const j = await res.json();
  return j.value?.[0]?.medium?.url ?? null;
}

export async function downloadOneDriveFile(
  accessToken: string,
  itemId: string,
  maxBytes = 200 * 1024 * 1024,
): Promise<{ buf: Buffer; contentType: string }> {
  const res = await fetch(`${GRAPH}/me/drive/items/${encodeURIComponent(itemId)}/content`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`OneDrive download ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const announced = Number(res.headers.get("content-length") ?? 0);
  if (Number.isFinite(announced) && announced > maxBytes) {
    try {
      await res.arrayBuffer().catch(() => undefined);
    } catch {
      /* best-effort drain */
    }
    throw new Error(`OneDrive file too large (${announced} bytes)`);
  }
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const ab = await res.arrayBuffer();
  if (ab.byteLength > maxBytes) throw new Error(`OneDrive file too large (${ab.byteLength} bytes)`);
  return { buf: Buffer.from(ab), contentType };
}
