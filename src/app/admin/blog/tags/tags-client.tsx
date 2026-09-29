"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Edit2, Trash2, Tag, GitMerge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { upsertBlogTagAction, deleteBlogTagAction, mergeBlogTagsAction } from "@/app/actions/blog";
import { sluggify } from "@/lib/blog";

type TagItem = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  _count: { posts: number };
};

export function TagsClient({ initialTags }: { initialTags: TagItem[] }) {
  const router = useRouter();
  const [tags, setTags] = React.useState(initialTags);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [mergeModalOpen, setMergeModalOpen] = React.useState(false);
  const [editingTag, setEditingTag] = React.useState<TagItem | null>(null);

  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  // Merge state
  const [sourceTagId, setSourceTagId] = React.useState("");
  const [targetTagId, setTargetTagId] = React.useState("");

  function openCreate() {
    setEditingTag(null);
    setName("");
    setSlug("");
    setDescription("");
    setModalOpen(true);
  }

  function openEdit(t: TagItem) {
    setEditingTag(t);
    setName(t.name);
    setSlug(t.slug);
    setDescription(t.description || "");
    setModalOpen(true);
  }

  function openMerge(t: TagItem) {
    setSourceTagId(t.id);
    const other = initialTags.find((item) => item.id !== t.id);
    setTargetTagId(other ? other.id : "");
    setMergeModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    try {
      const res = await upsertBlogTagAction({
        id: editingTag?.id,
        name: name.trim(),
        slug: slug.trim() || sluggify(name),
        description: description.trim() || undefined,
      });

      if (res.ok) {
        setModalOpen(false);
        router.refresh();
      } else {
        alert(res.error || "Failed to save tag");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMerge(e: React.FormEvent) {
    e.preventDefault();
    if (!sourceTagId || !targetTagId || sourceTagId === targetTagId) {
      alert("Please select distinct source and target tags to merge.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await mergeBlogTagsAction(sourceTagId, targetTagId);
      if (res.ok) {
        setMergeModalOpen(false);
        router.refresh();
      } else {
        alert(res.error || "Failed to merge tags");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(t: TagItem) {
    if (!confirm(`Delete tag #${t.name}?`)) return;

    const res = await deleteBlogTagAction(t.id);
    if (res.ok) {
      router.refresh();
    } else {
      alert("Failed to delete tag");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[var(--text-muted)]">
          Total Tags: <span className="font-semibold text-[var(--text)]">{initialTags.length}</span>
        </p>
        <Button variant="primary" size="sm" onClick={openCreate} className="gap-1.5 shadow-xs">
          <Plus size={14} />
          <span>New Tag</span>
        </Button>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-xs">
        <table className="w-full text-left border-collapse text-[13.5px]">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-hover)] text-[12px] font-semibold text-[var(--text-subtle)]">
              <th className="px-4 py-3">Tag</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3 text-right">Articles Used</th>
              <th className="w-24 px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {initialTags.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-[13.5px] text-[var(--text-muted)]">
                  No tags created yet.
                </td>
              </tr>
            ) : (
              initialTags.map((tag) => (
                <tr key={tag.id} className="transition-colors hover:bg-[var(--surface-hover)]">
                  <td className="px-4 py-3 font-semibold text-[var(--text)]">
                    <div className="flex items-center gap-1.5">
                      <Tag size={14} className="text-[var(--primary)]" />
                      <span>#{tag.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] text-[var(--text-muted)]">
                    /blog?tag={tag.slug}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-[var(--text-muted)] max-w-xs truncate">
                    {tag.description || "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-[var(--text)]">
                    {tag._count.posts}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openMerge(tag)}
                        className="rounded p-1 text-[var(--text-subtle)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                        title="Merge into another tag"
                      >
                        <GitMerge size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(tag)}
                        className="rounded p-1 text-[var(--text-subtle)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                        title="Edit"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(tag)}
                        className="rounded p-1 text-[var(--danger)] hover:bg-[var(--surface-hover)]"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create / Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTag ? "Edit Tag" : "New Tag"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-[var(--text)]">Tag Name</label>
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!editingTag && !slug) setSlug(sluggify(e.target.value));
                }}
                placeholder="e.g. ContentStrategy"
                required
                className="mt-1"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[var(--text)]">Slug</label>
              <Input
                value={slug}
                onChange={(e) => setSlug(sluggify(e.target.value))}
                placeholder="e.g. content-strategy"
                className="mt-1 font-mono text-[13px]"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[var(--text)]">Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this tag covers..."
                rows={3}
                className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-2.5 text-[13px] text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? "Saving..." : "Save Tag"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Merge Tags Modal */}
      <Dialog open={mergeModalOpen} onOpenChange={setMergeModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Merge Tags</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleMerge} className="space-y-4">
            <p className="text-[13px] text-[var(--text-muted)]">
              Move all articles tagged with the source tag to the target tag, then remove the source tag.
            </p>

            <div>
              <label className="block text-[12px] font-medium text-[var(--text)]">Source Tag (to be removed)</label>
              <select
                value={sourceTagId}
                onChange={(e) => setSourceTagId(e.target.value)}
                className="mt-1 h-9 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)]"
              >
                {initialTags.map((t) => (
                  <option key={t.id} value={t.id}>
                    #{t.name} ({t._count.posts} posts)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[var(--text)]">Target Tag (receives posts)</label>
              <select
                value={targetTagId}
                onChange={(e) => setTargetTagId(e.target.value)}
                className="mt-1 h-9 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)]"
              >
                {initialTags
                  .filter((t) => t.id !== sourceTagId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      #{t.name} ({t._count.posts} posts)
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setMergeModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? "Merging..." : "Merge Tags"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
