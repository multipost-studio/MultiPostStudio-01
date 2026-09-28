/**
 * Google Photos, via the Photos Picker API (the photospicker.mediaitems.readonly
 * scope). Google retired broad library-read access in 2025 — a third-party app
 * can no longer list "all the user's photos"; it can only see items the user
 * explicitly selects in a Google-hosted picker session. The flow:
 *
 *   1. createPickerSession() -> { id, pickerUri }
 *   2. Send the user to pickerUri (a new tab — this isn't an embeddable
 *      widget like Drive's JS Picker, it's a hosted page)
 *   3. Poll getPickerSession(id) until mediaItemsSet is true
 *   4. listPickedMediaItems(sessionId) for what they chose
 *   5. downloadPickedMediaItem() to pull bytes
 *   6. deletePickerSession(id) to clean up
 */
const API = "https://photospicker.googleapis.com/v1";

async function json(res: Response) {
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`.slice(0, 300));
  return res.json();
}

export type PickerSession = {
  id: string;
  pickerUri: string;
  mediaItemsSet: boolean;
  pollIntervalMs: number;
  expireTime: string;
};

function parseSession(j: {
  id: string;
  pickerUri: string;
  mediaItemsSet?: boolean;
  pollingConfig?: { pollInterval?: string };
  expireTime: string;
}): PickerSession {
  // pollInterval arrives as a duration string like "5s".
  const seconds = Number(j.pollingConfig?.pollInterval?.replace(/s$/, "")) || 5;
  return {
    id: j.id,
    pickerUri: j.pickerUri,
    mediaItemsSet: !!j.mediaItemsSet,
    pollIntervalMs: seconds * 1000,
    expireTime: j.expireTime,
  };
}

export async function createPickerSession(accessToken: string): Promise<PickerSession> {
  const j = await json(
    await fetch(`${API}/sessions`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: "{}",
    }),
  );
  return parseSession(j);
}

export async function getPickerSession(accessToken: string, sessionId: string): Promise<PickerSession> {
  const j = await json(
    await fetch(`${API}/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    }),
  );
  return parseSession(j);
}

export async function deletePickerSession(accessToken: string, sessionId: string): Promise<void> {
  await fetch(`${API}/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${accessToken}` },
  }).catch(() => {}); // best-effort cleanup, never blocks the import flow
}

export type PickedMediaItem = {
  id: string;
  filename: string;
  mimeType: string;
  baseUrl: string;
  isVideo: boolean;
  createTime?: string;
};

export async function listPickedMediaItems(accessToken: string, sessionId: string): Promise<PickedMediaItem[]> {
  const items: PickedMediaItem[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ sessionId, pageSize: "100" });
    if (pageToken) params.set("pageToken", pageToken);
    const j = await json(
      await fetch(`${API}/mediaItems?${params}`, { headers: { authorization: `Bearer ${accessToken}` } }),
    );
    type Raw = {
      id: string;
      createTime?: string;
      type?: string;
      mediaFile: { baseUrl: string; mimeType: string; filename: string };
    };
    const raw: Raw[] = j.mediaItems ?? [];
    for (const m of raw) {
      items.push({
        id: m.id,
        filename: m.mediaFile.filename,
        mimeType: m.mediaFile.mimeType,
        baseUrl: m.mediaFile.baseUrl,
        isVideo: m.mediaFile.mimeType.startsWith("video/") || m.type === "VIDEO",
        createTime: m.createTime,
      });
    }
    pageToken = j.nextPageToken;
  } while (pageToken);
  return items;
}

/** baseUrl needs a size/download param appended AND the bearer token on every fetch — it is not a public link. */
export async function downloadPickedMediaItem(
  accessToken: string,
  item: PickedMediaItem,
  maxBytes = 200 * 1024 * 1024,
): Promise<{ buf: Buffer; contentType: string }> {
  const url = `${item.baseUrl}=${item.isVideo ? "dv" : "d"}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Google Photos download ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const announced = Number(res.headers.get("content-length") ?? 0);
  if (Number.isFinite(announced) && announced > maxBytes) {
    try {
      await res.arrayBuffer().catch(() => undefined);
    } catch {
      /* best-effort drain */
    }
    throw new Error(`Google Photos file too large (${announced} bytes)`);
  }
  const contentType = res.headers.get("content-type") ?? item.mimeType;
  const ab = await res.arrayBuffer();
  if (ab.byteLength > maxBytes) throw new Error(`Google Photos file too large (${ab.byteLength} bytes)`);
  return { buf: Buffer.from(ab), contentType };
}

/** 512px thumbnail — same baseUrl, a size param instead of a download param, still needs the bearer token. */
export async function downloadThumbnail(accessToken: string, item: PickedMediaItem): Promise<Buffer | null> {
  const url = item.isVideo ? `${item.baseUrl}=w512-h512-no` : `${item.baseUrl}=w256-h256`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}
