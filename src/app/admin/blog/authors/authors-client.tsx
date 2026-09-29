"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Edit2, Trash2, UserCheck, Mail, Globe, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { upsertBlogAuthorAction, deleteBlogAuthorAction } from "@/app/actions/blog";
import { sluggify } from "@/lib/blog";

type AuthorItem = {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  avatar: string | null;
  bio: string | null;
  role: string | null;
  socialLinks: string | null;
  _count: { posts: number };
};

export function AuthorsClient({ initialAuthors }: { initialAuthors: AuthorItem[] }) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editingAuthor, setEditingAuthor] = React.useState<AuthorItem | null>(null);

  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState("Author");
  const [avatar, setAvatar] = React.useState("");
  const [bio, setBio] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  function openCreate() {
    setEditingAuthor(null);
    setName("");
    setSlug("");
    setEmail("");
    setRole("Author");
    setAvatar("");
    setBio("");
    setModalOpen(true);
  }

  function openEdit(a: AuthorItem) {
    setEditingAuthor(a);
    setName(a.name);
    setSlug(a.slug);
    setEmail(a.email || "");
    setRole(a.role || "Author");
    setAvatar(a.avatar || "");
    setBio(a.bio || "");
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    try {
      const res = await upsertBlogAuthorAction({
        id: editingAuthor?.id,
        name: name.trim(),
        slug: slug.trim() || sluggify(name),
        email: email.trim() || undefined,
        role: role.trim() || undefined,
        avatar: avatar.trim() || undefined,
        bio: bio.trim() || undefined,
      });

      if (res.ok) {
        setModalOpen(false);
        router.refresh();
      } else {
        alert(res.error || "Failed to save author");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(a: AuthorItem) {
    if (!confirm(`Delete author "${a.name}"? Articles by this author will not be deleted, but author attribution will be cleared.`)) {
      return;
    }

    const res = await deleteBlogAuthorAction(a.id);
    if (res.ok) {
      router.refresh();
    } else {
      alert("Failed to delete author");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[var(--text-muted)]">
          Total Authors: <span className="font-semibold text-[var(--text)]">{initialAuthors.length}</span>
        </p>
        <Button variant="primary" size="sm" onClick={openCreate} className="gap-1.5 shadow-xs">
          <Plus size={14} />
          <span>New Author</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {initialAuthors.map((author) => (
          <div
            key={author.id}
            className="flex flex-col justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xs transition-shadow hover:shadow-sm"
          >
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  {author.avatar ? (
                    <img src={author.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary-soft)] font-semibold text-[var(--primary)]">
                      {author.name.charAt(0)}
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold text-[var(--text)]">{author.name}</h3>
                    <p className="text-[12px] text-[var(--text-subtle)]">{author.role || "Author"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(author)}
                    className="rounded p-1 text-[var(--text-subtle)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                    title="Edit"
                    aria-label={`Edit author ${author.name}`}
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(author)}
                    className="rounded p-1 text-[var(--danger)] hover:bg-[var(--surface-hover)]"
                    title="Delete"
                    aria-label={`Delete author ${author.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {author.bio && (
                <p className="mt-3 text-[13px] text-[var(--text-muted)] line-clamp-2">{author.bio}</p>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-3 text-[12px] text-[var(--text-subtle)]">
              <span>{author._count.posts} published articles</span>
              {author.email && (
                <span className="flex min-w-0 items-center gap-1 truncate max-w-[150px]">
                  <Mail size={11} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{author.email}</span>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Create / Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAuthor ? "Edit Author" : "New Author"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-[var(--text)]">Author Name</label>
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!editingAuthor && !slug) setSlug(sluggify(e.target.value));
                }}
                placeholder="e.g. Jane Doe"
                required
                className="mt-1"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[var(--text)]">Slug</label>
              <Input
                value={slug}
                onChange={(e) => setSlug(sluggify(e.target.value))}
                placeholder="e.g. jane-doe"
                className="mt-1 font-mono text-[13px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[13px] font-medium text-[var(--text)]">Role / Title</label>
                <Input
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. Head of Content"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-[var(--text)]">Email (Optional)</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@company.com"
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[var(--text)]">Avatar Image URL (Optional)</label>
              <Input
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
                placeholder="https://.../avatar.jpg"
                className="mt-1"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[var(--text)]">Biography</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Brief writer bio for article footer..."
                rows={3}
                className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-2.5 text-[13px] text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? "Saving..." : "Save Author"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
