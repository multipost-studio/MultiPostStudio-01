/**
 * Dropbox integration. Lists and downloads media from the user's Dropbox via
 * the standard Files API (files.content.read scope grants normal folder
 * access — unlike Google Drive's drive.file, there's no picker-only
 * restriction here).
 */

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const VIDEO_EXT = new Set(["mp4", "mov", "webm"]);

export type DropboxFile = {
  id: string;
  name: string;
  path: string;
  size?: number;
  modifiedTime?: string;
  isVideo: boolean;
};

function extOf(name: string): string {
  return name.slice(name.lastIndexOf(".") + 1).toLowerCase();
}

/** Root ("") or a named folder — no recursive walk, matches Drive's flat listing scope. */
export async function listDropboxFiles(accessToken: string, path = ""): Promise<{ files: DropboxFile[] }> {
  const res = await fetch("https://api.dropboxapi.com/2/files/list_folder", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ path, recursive: false, limit: 100 }),
  });
  if (!res.ok) throw new Error(`Dropbox list ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  type Entry = { ".tag": string; id: string; name: string; path_display: string; size?: number; server_modified?: string };
  const entries: Entry[] = j.entries ?? [];
  const files = entries
    .filter((e) => e[".tag"] === "file")
    .map((e) => ({ ext: extOf(e.name), e }))
    .filter(({ ext }) => IMAGE_EXT.has(ext) || VIDEO_EXT.has(ext))
    .map(({ ext, e }) => ({
      id: e.id,
      name: e.name,
      path: e.path_display,
      size: e.size,
      modifiedTime: e.server_modified,
      isVideo: VIDEO_EXT.has(ext),
    }));
  return { files };
}

/** 128x128 JPEG thumbnail for a file, or null if Dropbox can't render one (not every format is supported). */
export async function dropboxThumbnail(accessToken: string, path: string): Promise<Buffer | null> {
  const res = await fetch("https://content.dropboxapi.com/2/files/get_thumbnail_v2", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({
        resource: { ".tag": "path", path },
        format: { ".tag": "jpeg" },
        size: { ".tag": "w128h128" },
      }),
    },
  });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

export async function downloadDropboxFile(
  accessToken: string,
  path: string,
  maxBytes = 200 * 1024 * 1024,
): Promise<{ buf: Buffer; contentType: string }> {
  const res = await fetch("https://content.dropboxapi.com/2/files/download", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "Dropbox-API-Arg": JSON.stringify({ path }),
    },
  });
  if (!res.ok) throw new Error(`Dropbox download ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const announced = Number(res.headers.get("content-length") ?? 0);
  if (Number.isFinite(announced) && announced > maxBytes) {
    try {
      await res.arrayBuffer().catch(() => undefined);
    } catch {
      /* best-effort drain */
    }
    throw new Error(`Dropbox file too large (${announced} bytes)`);
  }
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const ab = await res.arrayBuffer();
  if (ab.byteLength > maxBytes) throw new Error(`Dropbox file too large (${ab.byteLength} bytes)`);
  return { buf: Buffer.from(ab), contentType };
}
