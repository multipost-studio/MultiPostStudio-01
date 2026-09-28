"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { uploadFiles } from "@/lib/upload-media";
import { setVideoThumbnailAction } from "@/app/actions/media";
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
      // A video's captured frame updates that video's own thumbnail in
      // place — it must never become a new, separate MediaAsset (that would
      // silently swap the video out for a JPEG wherever the original is
      // attached, e.g. a composer draft's mediaIds). Editing an image is a
      // different, intentional case: it creates a new derivative asset so
      // the original is never destructively overwritten.
      if (isVideo && asset) {
        const form = new FormData();
        form.set("file", file);
        const res = await setVideoThumbnailAction(asset.id, form);
        setSaving(false);
        if (res.ok) {
          toast({ title: "Thumbnail saved", tone: "success" });
          onSaveSuccess?.({ id: asset.id, url: asset.url, filename: asset.filename, kind: "video", thumbUrl: (res.data as { thumbUrl: string }).thumbUrl });
          onClose();
        } else {
          toast({ title: "Save failed", description: res.error, tone: "error" });
        }
        return;
      }

      const res = await uploadFiles([file]);
      setSaving(false);

      if (res.okCount > 0 && res.newIds.length > 0) {
        toast({
          title: "Edited image saved",
          description: `Saved as ${file.name}`,
          tone: "success",
        });
        onSaveSuccess?.({
          id: res.newIds[0],
          url: URL.createObjectURL(file), // immediate client display
          filename: file.name,
          kind: "image",
        });
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
