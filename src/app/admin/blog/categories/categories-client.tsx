"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Edit2, Trash2, FolderTree, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { upsertBlogCategoryAction, deleteBlogCategoryAction } from "@/app/actions/blog";
import { sluggify } from "@/lib/blog";

type CategoryItem = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  parent: { id: string; name: string } | null;
  _count: { posts: number };
};

export function CategoriesClient({ initialCategories }: { initialCategories: CategoryItem[] }) {
  const router = useRouter();
  const [categories, setCategories] = React.useState(initialCategories);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editingCat, setEditingCat] = React.useState<CategoryItem | null>(null);

  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [parentId, setParentId] = React.useState<string>("");
  const [sortOrder, setSortOrder] = React.useState(0);
  const [submitting, setSubmitting] = React.useState(false);

  function openCreate() {
    setEditingCat(null);
    setName("");
    setSlug("");
    setDescription("");
    setParentId("");
    setSortOrder(0);
    setModalOpen(true);
  }

  function openEdit(cat: CategoryItem) {
    setEditingCat(cat);
    setName(cat.name);
    setSlug(cat.slug);
    setDescription(cat.description || "");
    setParentId(cat.parentId || "");
    setSortOrder(cat.sortOrder);
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    try {
      const res = await upsertBlogCategoryAction({
        id: editingCat?.id,
        name: name.trim(),
        slug: slug.trim() || sluggify(name),
        description: description.trim() || undefined,
        parentId: parentId || null,
        sortOrder,
      });

      if (res.ok) {
        setModalOpen(false);
        router.refresh();
      } else {
        alert(res.error || "Failed to save category");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(cat: CategoryItem) {
    if (!confirm(`Delete category "${cat.name}"? Articles in this category will not be deleted, but will have their category removed.`)) {
      return;
    }

    const res = await deleteBlogCategoryAction(cat.id);
    if (res.ok) {
      router.refresh();
    } else {
      alert("Failed to delete category");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[var(--text-muted)]">
          Total Categories: <span className="font-semibold text-[var(--text)]">{initialCategories.length}</span>
        </p>
        <Button variant="primary" size="sm" onClick={openCreate} className="gap-1.5 shadow-xs">
          <Plus size={14} />
          <span>New Category</span>
        </Button>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-xs">
        <table className="w-full text-left border-collapse text-[13.5px]">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-hover)] text-[12px] font-semibold text-[var(--text-subtle)]">
              <th className="px-4 py-3">Category Name</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Parent</th>
              <th className="px-4 py-3 text-right">Articles</th>
              <th className="w-20 px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {initialCategories.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-[13.5px] text-[var(--text-muted)]">
                  No categories created yet.
                </td>
              </tr>
            ) : (
              initialCategories.map((cat) => (
                <tr key={cat.id} className="transition-colors hover:bg-[var(--surface-hover)]">
                  <td className="px-4 py-3 font-semibold text-[var(--text)]">
                    <div className="flex items-center gap-2">
                      <FolderTree size={16} className="text-[var(--primary)]" />
                      <span>{cat.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] text-[var(--text-muted)]">
                    /blog?category={cat.slug}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-[var(--text-muted)] max-w-xs truncate">
                    {cat.description || "—"}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-[var(--text-muted)]">
                    {cat.parent?.name || "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-[var(--text)]">
                    {cat._count.posts}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(cat)}
                        className="rounded p-1 text-[var(--text-subtle)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                        title="Edit"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(cat)}
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
            <DialogTitle>{editingCat ? "Edit Category" : "New Category"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-[var(--text)]">Category Name</label>
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!editingCat && !slug) setSlug(sluggify(e.target.value));
                }}
                placeholder="e.g. Social Strategy"
                required
                className="mt-1"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[var(--text)]">Slug</label>
              <Input
                value={slug}
                onChange={(e) => setSlug(sluggify(e.target.value))}
                placeholder="e.g. social-strategy"
                className="mt-1 font-mono text-[13px]"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[var(--text)]">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief summary of this topic..."
                rows={3}
                className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-2.5 text-[13px] text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[var(--text)]">Parent Category (Optional)</label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="mt-1 h-9 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)]"
              >
                <option value="">None (Top-level)</option>
                {initialCategories
                  .filter((c) => !editingCat || c.id !== editingCat.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? "Saving..." : "Save Category"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
