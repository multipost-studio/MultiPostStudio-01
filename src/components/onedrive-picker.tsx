"use client";

import { CloudFilePicker, type CloudItem } from "@/components/cloud-file-picker";
import { listOneDriveFilesAction, oneDriveThumbnailAction, importOneDriveFilesAction } from "@/app/actions/onedrive";

type OneDriveFile = { id: string; name: string; size?: number; modifiedTime?: string; isVideo: boolean };

export function OneDrivePicker({
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
      providerLabel="OneDrive"
      connected={connected}
      connectHref="/api/integrations/onedrive/start"
      onImported={onImported}
      onList={async () => {
        const res = await listOneDriveFilesAction();
        if (!res.ok || !res.data) return res as { ok: boolean; error?: string };
        const items: CloudItem[] = (res.data as OneDriveFile[]).map((f) => ({
          key: f.id,
          name: f.name,
          size: f.size,
          modifiedTime: f.modifiedTime,
          isVideo: f.isVideo,
        }));
        return { ok: true, data: items };
      }}
      onThumbnail={async (item) => oneDriveThumbnailAction(item.key)}
      onImport={async (items) =>
        importOneDriveFilesAction({ files: items.map((i) => ({ id: i.key, name: i.name })), folderId })
      }
    />
  );
}
