"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { uploadFiles } from "@/lib/upload-media";
import { ImageEditor } from "./image-editor";
import { VideoThumbnailPicker } from "./video-thumbnail-picker";

export { ImageEditor } from "./image-editor";
export { VideoThumbnailPicker } from "./video-thumbnail-picker";

export interface EditableAsset {
  id: string;
  url: string;
  filename: string;
  kind: string;
  thumbUrl?: string | null;
}

export interface MediaEditorModalProps {
  open: boolean;
  onClose: () => void;
  asset: EditableAsset | null;
  onSaveSuccess?: (newAsset: { id: string; url: string; filename: string; kind: string; thumbUrl?: string | null }) => void;
}

export function MediaEditorModal({
  open,
  onClose,
  asset,
  onSaveSuccess,
}: MediaEditorModalProps) {
  const { toast } = useToast();
  const [saving, setSaving] = React.useState(false);

  if (!asset) return null;

  const isVideo = asset.kind === "video";

  async function handleSaveFile(file: File) {
    setSaving(true);
    try {
      const res = await uploadFiles([file]);
      setSaving(false);

      if (res.okCount > 0 && res.newIds.length > 0) {
        toast({
          title: isVideo ? "Thumbnail created" : "Edited image saved",
          description: `Saved as ${file.name}`,
          tone: "success",
        });

        // If a callback was provided, notify the caller
        if (onSaveSuccess) {
          onSaveSuccess({
            id: res.newIds[0],
            url: URL.createObjectURL(file), // immediate client display
            filename: file.name,
            kind: isVideo ? "image" : "image",
          });
        }
        onClose();
      } else {
        toast({
          title: "Save failed",
          description: res.firstError ?? "Unable to upload edited asset",
          tone: "error",
        });
      }
    } catch (err) {
      setSaving(false);
      toast({
        title: "Save error",
        description: err instanceof Error ? err.message : "Unexpected error while saving",
        tone: "error",
      });
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      title={isVideo ? "Video Frame Picker" : `Edit Image: ${asset.filename}`}
      size="lg"
    >
      {isVideo ? (
        <VideoThumbnailPicker
          videoUrl={asset.url}
          filename={asset.filename}
          loading={saving}
          onSave={handleSaveFile}
          onCancel={onClose}
        />
      ) : (
        <ImageEditor
          imageUrl={asset.url}
          filename={asset.filename}
          loading={saving}
          onSave={handleSaveFile}
          onCancel={onClose}
        />
      )}
    </Modal>
  );
}
