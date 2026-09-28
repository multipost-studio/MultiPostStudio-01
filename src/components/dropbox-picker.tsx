"use client";

import { CloudFilePicker, type CloudItem } from "@/components/cloud-file-picker";
import { listDropboxFilesAction, dropboxThumbnailAction, importDropboxFilesAction } from "@/app/actions/dropbox";

type DropboxFile = { id: string; name: string; path: string; size?: number; modifiedTime?: string; isVideo: boolean };

export function DropboxPicker({
  connected,
  folderId,
  onImported,
}: {
  connected: boolean;
  folderId?: string | null;
  onImported: (assetId: string) => void;
}) {
  return (
    <CloudFilePicker
      providerLabel="Dropbox"
      connected={connected}
      connectHref="/api/integrations/dropbox/start"
      onImported={onImported}
      onList={async () => {
        const res = await listDropboxFilesAction();
        if (!res.ok || !res.data) return res as { ok: boolean; error?: string };
        const items: CloudItem[] = (res.data as DropboxFile[]).map((f) => ({
          key: f.path,
          name: f.name,
          size: f.size,
          modifiedTime: f.modifiedTime,
          isVideo: f.isVideo,
        }));
        return { ok: true, data: items };
      }}
      onThumbnail={async (item) => dropboxThumbnailAction(item.key)}
      onImport={async (items) =>
        importDropboxFilesAction({ files: items.map((i) => ({ path: i.key, name: i.name })), folderId })
      }
    />
  );
}
