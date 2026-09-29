"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Send,
  Clock,
  Sparkles,
  Eye,
  History,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Heading1,
  Heading2,
  Heading3,
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Code,
  Link2,
  Table as TableIcon,
  HelpCircle,
  Share2,
  Calendar,
  Globe,
  Tag as TagIcon,
  User,
  Sliders,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SeoChecklistCard } from "./_components/seo-checklist-card";
import { SeoPreviewModal } from "./_components/seo-preview-modal";
import { BlogPreviewModal } from "./_components/blog-preview-modal";
import { MediaPickerModal } from "./_components/media-picker-modal";
import { RevisionHistoryModal, type RevisionItem } from "./_components/revision-history-modal";
import { analyzeBlogSeo, sluggify } from "@/lib/blog";
import {
  upsertBlogPostAction,
  autosaveBlogPostAction,
  setBlogPostStatusAction,
  aiBlogAssistAction,
  upsertBlogCategoryAction,
  upsertBlogAuthorAction,
} from "@/app/actions/blog";

export function BlogEditorClient({
  initialPost,
  categories,
  authors,
  availableTags,
}: {
  initialPost?: {
    id: string;
    title: string;
    slug: string;
    subtitle?: string | null;
    excerpt?: string | null;
    content: string;
    status: string;
    featuredImage?: string | null;
    featuredImageAlt?: string | null;
    featuredImageCaption?: string | null;
    authorId?: string | null;
    categoryId?: string | null;
    readMins?: number;
    publishedAt?: Date | string | null;
    scheduledAt?: Date | string | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
    focusKeyword?: string | null;
    secondaryKeywords?: string | null;
    canonicalUrl?: string | null;
    robotsDirectives?: string | null;
    ogTitle?: string | null;
    ogDescription?: string | null;
    ogImage?: string | null;
    twitterTitle?: string | null;
    twitterDescription?: string | null;
    twitterImage?: string | null;
    allowComments?: boolean;
    isFeatured?: boolean;
    tags?: { tag: { id: string; name: string } }[];
    revisions?: RevisionItem[];
  };
  categories: { id: string; name: string; slug: string }[];
  authors: { id: string; name: string }[];
  availableTags: { id: string; name: string; slug: string }[];
}) {
  const router = useRouter();

  // Core Form State
  const [postId, setPostId] = React.useState<string | undefined>(initialPost?.id);
  const [title, setTitle] = React.useState(initialPost?.title || "");
  const [subtitle, setSubtitle] = React.useState(initialPost?.subtitle || "");
  const [slug, setSlug] = React.useState(initialPost?.slug || "");
  const [content, setContent] = React.useState(initialPost?.content || "");
  const [excerpt, setExcerpt] = React.useState(initialPost?.excerpt || "");
  const [status, setStatus] = React.useState(initialPost?.status || "draft");
  const [categoryId, setCategoryId] = React.useState(initialPost?.categoryId || categories[0]?.id || "");
  const [authorId, setAuthorId] = React.useState(initialPost?.authorId || authors[0]?.id || "");
  const [selectedTagIds, setSelectedTagIds] = React.useState<string[]>(
    initialPost?.tags?.map((t) => t.tag.id) || [],
  );

  // Featured Image
  const [featuredImage, setFeaturedImage] = React.useState(initialPost?.featuredImage || "");
  const [featuredImageAlt, setFeaturedImageAlt] = React.useState(initialPost?.featuredImageAlt || "");
  const [featuredImageCaption, setFeaturedImageCaption] = React.useState(initialPost?.featuredImageCaption || "");

  // Scheduling
  const [scheduledDate, setScheduledDate] = React.useState(
    initialPost?.scheduledAt
      ? new Date(initialPost.scheduledAt).toISOString().slice(0, 16)
      : new Date(Date.now() + 86400000).toISOString().slice(0, 16),
  );

  // SEO Fields
  const [seoTitle, setSeoTitle] = React.useState(initialPost?.seoTitle || "");
  const [seoDescription, setSeoDescription] = React.useState(initialPost?.seoDescription || "");
  const [focusKeyword, setFocusKeyword] = React.useState(initialPost?.focusKeyword || "");
  const [secondaryKeywords, setSecondaryKeywords] = React.useState(initialPost?.secondaryKeywords || "");
  const [canonicalUrl, setCanonicalUrl] = React.useState(initialPost?.canonicalUrl || "");
  const [robotsDirectives, setRobotsDirectives] = React.useState(initialPost?.robotsDirectives || "index, follow");

  // OpenGraph & Social
  const [ogTitle, setOgTitle] = React.useState(initialPost?.ogTitle || "");
  const [ogDescription, setOgDescription] = React.useState(initialPost?.ogDescription || "");
  const [ogImage, setOgImage] = React.useState(initialPost?.ogImage || "");

  // Settings
  const [allowComments, setAllowComments] = React.useState(initialPost?.allowComments ?? true);
  const [isFeatured, setIsFeatured] = React.useState(initialPost?.isFeatured ?? false);

  // Editor View Mode
  const [tab, setTab] = React.useState<"editor" | "seo" | "settings">("editor");

  // Modals
  const [seoPreviewOpen, setSeoPreviewOpen] = React.useState(false);
  const [blogPreviewOpen, setBlogPreviewOpen] = React.useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = React.useState(false);
  const [mediaPickerTarget, setMediaPickerTarget] = React.useState<"featured" | "inline">("featured");
  const [revisionModalOpen, setRevisionModalOpen] = React.useState(false);
  const [revisions, setRevisions] = React.useState<RevisionItem[]>(initialPost?.revisions || []);

  // Inline Quick Add Modals
  const [newCategoryName, setNewCategoryName] = React.useState("");
  const [showAddCategory, setShowAddCategory] = React.useState(false);
  const [categoryList, setCategoryList] = React.useState(categories);

  // Autosave & Status State
  const [saveStatus, setSaveStatus] = React.useState<"idle" | "saving" | "saved" | "unsaved">("idle");
  const [lastSavedTime, setLastSavedTime] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [aiLoading, setAiLoading] = React.useState(false);

  // Reference for textarea formatting insertion
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Auto-slug generation from title if new post
  React.useEffect(() => {
    if (!initialPost?.id && title && !slug) {
      setSlug(sluggify(title));
    }
  }, [title, slug, initialPost?.id]);

  // Compute live SEO score & checklist
  const seoAnalysis = React.useMemo(() => {
    return analyzeBlogSeo({
      title,
      seoTitle,
      excerpt,
      seoDescription,
      slug,
      content,
      focusKeyword,
      featuredImage,
      featuredImageAlt,
    });
  }, [title, seoTitle, excerpt, seoDescription, slug, content, focusKeyword, featuredImage, featuredImageAlt]);

  // ---------------- AUTOSAVE LOGIC ----------------
  const autosaveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    if (!title.trim() && !content.trim()) return;

    setSaveStatus("unsaved");

    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    autosaveTimeoutRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const res = await autosaveBlogPostAction({
          id: postId,
          title: title || "Untitled Draft",
          content,
          subtitle,
          excerpt,
        });

        if (res.ok && res.id) {
          if (!postId) setPostId(res.id);
          setSaveStatus("saved");
          setLastSavedTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
        } else {
          setSaveStatus("unsaved");
        }
      } catch {
        setSaveStatus("unsaved");
      }
    }, 2500);

    return () => {
      if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
    };
  }, [title, content, subtitle, excerpt, postId]);

  // ---------------- TOOLBAR ACTIONS ----------------
  function insertTextAtCursor(before: string, after = "") {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.substring(start, end);
    const replacement = `${before}${selected || "text"}${after}`;

    const newContent = content.substring(0, start) + replacement + content.substring(end);
    setContent(newContent);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + (selected ? selected.length : 4));
    }, 10);
  }

  // ---------------- SAVE / PUBLISH ACTIONS ----------------
  async function handleSave(newStatus?: string) {
    if (!title.trim()) {
      alert("Please provide an article title.");
      return;
    }
    if (!content.trim()) {
      alert("Please write some content for the article.");
      return;
    }

    setSubmitting(true);
    const targetStatus = newStatus || status;

    try {
      const res = await upsertBlogPostAction({
        id: postId,
        title: title.trim(),
        slug: slug.trim() || sluggify(title),
        subtitle: subtitle.trim() || null,
        excerpt: excerpt.trim() || null,
        content,
        status: targetStatus as any,
        featuredImage: featuredImage.trim() || null,
        featuredImageAlt: featuredImageAlt.trim() || null,
        featuredImageCaption: featuredImageCaption.trim() || null,
        authorId: authorId || null,
        categoryId: categoryId || null,
        readMins: seoAnalysis.estimatedReadMins,
        scheduledAt: targetStatus === "scheduled" ? new Date(scheduledDate).toISOString() : null,
        seoTitle: seoTitle.trim() || null,
        seoDescription: seoDescription.trim() || null,
        focusKeyword: focusKeyword.trim() || null,
        secondaryKeywords: secondaryKeywords.trim() || null,
        canonicalUrl: canonicalUrl.trim() || null,
        robotsDirectives,
        ogTitle: ogTitle.trim() || null,
        ogDescription: ogDescription.trim() || null,
        ogImage: ogImage.trim() || null,
        allowComments,
        isFeatured,
        tagIds: selectedTagIds,
      });

      if (res.ok && res.post) {
        setPostId(res.post.id);
        setStatus(res.post.status);
        setSaveStatus("saved");
        setLastSavedTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
        router.push(`/admin/blog/${res.post.id}`);
        router.refresh();
      } else {
        alert(res.error || "Failed to save article");
      }
    } catch {
      alert("Failed to save article");
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------- AI ASSISTANT ----------------
  async function handleAiAssist(mode: "outline" | "title_ideas" | "meta_description" | "excerpt") {
    setAiLoading(true);
    try {
      const res = await aiBlogAssistAction({ mode, title, topic: title, content });
      if (res.ok && res.result) {
        if (mode === "outline") {
          setContent((prev) => (prev ? `${prev}\n\n${res.result}` : String(res.result)));
        } else if (mode === "excerpt") {
          setExcerpt(String(res.result));
        } else if (mode === "meta_description") {
          setSeoDescription(String(res.result));
        } else if (mode === "title_ideas" && Array.isArray(res.result)) {
          const picked = prompt(`Suggested Titles:\n\n${res.result.map((t: string, i: number) => `${i + 1}. ${t}`).join("\n")}\n\nEnter number to select or Cancel:`);
          if (picked && res.result[parseInt(picked, 10) - 1]) {
            setTitle(res.result[parseInt(picked, 10) - 1]);
          }
        }
      }
    } finally {
      setAiLoading(false);
    }
  }

  // Quick category creation
  async function handleCreateCategory() {
    if (!newCategoryName.trim()) return;
    const res = await upsertBlogCategoryAction({ name: newCategoryName.trim() });
    if (res.ok && res.category) {
      setCategoryList([...categoryList, res.category]);
      setCategoryId(res.category.id);
      setNewCategoryName("");
      setShowAddCategory(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Top Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/blog"
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-[var(--text)]">
                {title ? title : "Untitled Blog Post"}
              </h2>
              <Badge tone={status === "published" ? "success" : status === "scheduled" ? "info" : "neutral"}>
                {status.toUpperCase()}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-[12px] text-[var(--text-subtle)]">
              {saveStatus === "saving" && <span className="text-[var(--primary)] font-medium">Autosaving...</span>}
              {saveStatus === "saved" && lastSavedTime && <span>Autosaved at {lastSavedTime}</span>}
              {saveStatus === "unsaved" && <span className="text-[var(--warning)]">Unsaved changes</span>}
              <span>·</span>
              <span>~{seoAnalysis.estimatedReadMins} min read</span>
              <span>·</span>
              <span>{seoAnalysis.wordCount} words</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* AI Helper Menu */}
          <div className="relative group">
            <Button
              variant="outline"
              size="sm"
              disabled={aiLoading}
              className="gap-1.5 border-[var(--primary)]/30 text-[var(--primary)] hover:bg-[var(--primary-soft)]"
            >
              <Sparkles size={14} />
              <span>AI Assist</span>
            </Button>
            <div className="invisible absolute right-0 top-full z-20 mt-1 w-48 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg group-hover:visible group-focus-within:visible">
              <button
                type="button"
                onClick={() => handleAiAssist("outline")}
                className="w-full rounded px-2.5 py-1.5 text-left text-[12px] text-[var(--text)] hover:bg-[var(--surface-hover)]"
              >
                Generate Article Outline
              </button>
              <button
                type="button"
                onClick={() => handleAiAssist("title_ideas")}
                className="w-full rounded px-2.5 py-1.5 text-left text-[12px] text-[var(--text)] hover:bg-[var(--surface-hover)]"
              >
                Suggest Title Ideas
              </button>
              <button
                type="button"
                onClick={() => handleAiAssist("excerpt")}
                className="w-full rounded px-2.5 py-1.5 text-left text-[12px] text-[var(--text)] hover:bg-[var(--surface-hover)]"
              >
                Generate Excerpt
              </button>
              <button
                type="button"
                onClick={() => handleAiAssist("meta_description")}
                className="w-full rounded px-2.5 py-1.5 text-left text-[12px] text-[var(--text)] hover:bg-[var(--surface-hover)]"
              >
                Generate Meta Description
              </button>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setBlogPreviewOpen(true)}
            className="gap-1.5"
            title="Preview on Desktop, Tablet & Mobile"
          >
            <Eye size={14} />
            <span>Live Preview</span>
          </Button>

          {postId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRevisionModalOpen(true)}
              className="gap-1.5"
              title="View & restore revisions"
            >
              <History size={14} />
              <span>Revisions ({revisions.length})</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            disabled={submitting}
            onClick={() => handleSave("draft")}
            className="gap-1.5"
          >
            <Save size={14} />
            <span>Save Draft</span>
          </Button>

          {status === "scheduled" ? (
            <Button
              variant="primary"
              size="sm"
              disabled={submitting}
              onClick={() => handleSave("scheduled")}
              className="gap-1.5 shadow-xs"
            >
              <Clock size={14} />
              <span>Reschedule</span>
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              disabled={submitting}
              onClick={() => handleSave("published")}
              className="gap-1.5 shadow-xs"
            >
              <Send size={14} />
              <span>{status === "published" ? "Update Post" : "Publish Now"}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Main Grid: Left Editor & Right Sidebar */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column (8 cols): Content & Editing */}
        <div className="space-y-4 lg:col-span-8">
          {/* Editor Mode Tabs */}
          <div className="flex border-b border-[var(--border)] text-[13px]">
            <button
              type="button"
              onClick={() => setTab("editor")}
              className={`border-b-2 px-4 py-2 font-medium ${
                tab === "editor"
                  ? "border-[var(--primary)] text-[var(--primary)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              Content Editor
            </button>
            <button
              type="button"
              onClick={() => setTab("seo")}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2 font-medium ${
                tab === "seo"
                  ? "border-[var(--primary)] text-[var(--primary)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              <span>SEO & Metadata</span>
              <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${seoAnalysis.score >= 80 ? "bg-[var(--success)]/20 text-[var(--success)]" : "bg-[var(--warning)]/20 text-[var(--warning)]"}`}>
                {seoAnalysis.score}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setTab("settings")}
              className={`border-b-2 px-4 py-2 font-medium ${
                tab === "settings"
                  ? "border-[var(--primary)] text-[var(--primary)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              Settings & Social
            </button>
          </div>

          {tab === "editor" ? (
            <div className="space-y-4">
              {/* Post Title */}
              <div>
                <Input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Article Headline (Title)..."
                  className="h-12 text-2xl font-bold tracking-tight text-[var(--text)] placeholder:text-[var(--text-subtle)]"
                />
              </div>

              {/* Subtitle / Deck */}
              <div>
                <Input
                  type="text"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="Article Subtitle or secondary hook (optional)..."
                  className="text-[15px] text-[var(--text-muted)] placeholder:text-[var(--text-subtle)]"
                />
              </div>

              {/* Slug Preview & Edit */}
              <div className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--surface-hover)] px-3 py-1.5 text-[12px] text-[var(--text-subtle)]">
                <span>URL: multipoststudio.app/blog/</span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(sluggify(e.target.value))}
                  placeholder="slug"
                  className="flex-1 bg-transparent font-mono text-[var(--text)] focus:outline-none"
                />
              </div>

              {/* Formatting Toolbar */}
              <div className="flex flex-wrap items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-2xs">
                <button
                  type="button"
                  onClick={() => insertTextAtCursor("## ")}
                  className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                  title="Heading 2 (##)"
                >
                  <Heading2 size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => insertTextAtCursor("### ")}
                  className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                  title="Heading 3 (###)"
                >
                  <Heading3 size={16} />
                </button>
                <div className="h-4 w-px bg-[var(--border)]" />
                <button
                  type="button"
                  onClick={() => insertTextAtCursor("**", "**")}
                  className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                  title="Bold (**text**)"
                >
                  <Bold size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => insertTextAtCursor("*", "*")}
                  className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                  title="Italic (*text*)"
                >
                  <Italic size={16} />
                </button>
                <div className="h-4 w-px bg-[var(--border)]" />
                <button
                  type="button"
                  onClick={() => insertTextAtCursor("- ")}
                  className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                  title="Bullet List (- item)"
                >
                  <List size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => insertTextAtCursor("1. ")}
                  className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                  title="Numbered List (1. item)"
                >
                  <ListOrdered size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => insertTextAtCursor("> ")}
                  className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                  title="Blockquote (> quote)"
                >
                  <Quote size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => insertTextAtCursor("```\n", "\n```")}
                  className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                  title="Code Block"
                >
                  <Code size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => insertTextAtCursor("[", "](https://)")}
                  className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                  title="Insert Link"
                >
                  <Link2 size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMediaPickerTarget("inline");
                    setMediaPickerOpen(true);
                  }}
                  className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                  title="Insert Image"
                >
                  <ImageIcon size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => insertTextAtCursor("| Feature | MultiPost | Others |\n| --- | --- | --- |\n| Auto-Publish | Yes | Limited |\n")}
                  className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                  title="Insert Table"
                >
                  <TableIcon size={16} />
                </button>
              </div>

              {/* Rich Body Textarea */}
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={20}
                  placeholder="Write your article in Markdown / Rich Text here..."
                  className="w-full resize-y rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 font-mono text-[14px] leading-relaxed text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--primary)] focus:outline-none"
                />
              </div>

              {/* Article Excerpt */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[13px] font-medium text-[var(--text)]">
                    Article Summary / Excerpt
                  </label>
                  <button
                    type="button"
                    onClick={() => handleAiAssist("excerpt")}
                    className="flex items-center gap-1 text-[11px] font-semibold text-[var(--primary)] hover:underline"
                  >
                    <Sparkles size={11} />
                    <span>Auto-generate with AI</span>
                  </button>
                </div>
                <textarea
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                  rows={3}
                  placeholder="Brief synopsis for blog index cards, newsletter teasers, and search results..."
                  className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3 text-[13.5px] text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
                />
              </div>
            </div>
          ) : tab === "seo" ? (
            /* SEO & SERP Tab */
            <div className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <div>
                  <h3 className="text-base font-semibold text-[var(--text)]">Search Engine Optimization (SEO)</h3>
                  <p className="text-[12px] text-[var(--text-muted)]">Configure metadata to rank high in organic search results.</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSeoPreviewOpen(true)}
                  className="gap-1.5"
                >
                  <Globe size={14} />
                  <span>Google & Social Preview</span>
                </Button>
              </div>

              <div>
                <div className="flex items-center justify-between text-[13px]">
                  <label className="font-medium text-[var(--text)]">SEO Title Tag</label>
                  <span className={`text-[11px] tabular-nums ${seoTitle.length > 60 ? "text-[var(--warning)]" : "text-[var(--text-subtle)]"}`}>
                    {seoTitle.length}/60 chars
                  </span>
                </div>
                <Input
                  value={seoTitle}
                  onChange={(e) => setSeoTitle(e.target.value)}
                  placeholder={title || "Defaults to article title"}
                  className="mt-1 text-[13.5px]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-[13px]">
                  <label className="font-medium text-[var(--text)]">Meta Description</label>
                  <span className={`text-[11px] tabular-nums ${seoDescription.length > 160 ? "text-[var(--warning)]" : "text-[var(--text-subtle)]"}`}>
                    {seoDescription.length}/155 chars
                  </span>
                </div>
                <textarea
                  value={seoDescription}
                  onChange={(e) => setSeoDescription(e.target.value)}
                  rows={3}
                  placeholder={excerpt || "Defaults to article summary"}
                  className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3 text-[13px] text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-[13px] font-medium text-[var(--text)]">Focus Keyword</label>
                  <Input
                    value={focusKeyword}
                    onChange={(e) => setFocusKeyword(e.target.value)}
                    placeholder="e.g. social media scheduling"
                    className="mt-1 text-[13px]"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[var(--text)]">Secondary Keywords</label>
                  <Input
                    value={secondaryKeywords}
                    onChange={(e) => setSecondaryKeywords(e.target.value)}
                    placeholder="comma, separated, terms"
                    className="mt-1 text-[13px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-[13px] font-medium text-[var(--text)]">Canonical URL (optional)</label>
                  <Input
                    value={canonicalUrl}
                    onChange={(e) => setCanonicalUrl(e.target.value)}
                    placeholder="https://original-source.com/article"
                    className="mt-1 text-[13px]"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[var(--text)]">Robots Directives</label>
                  <select
                    value={robotsDirectives}
                    onChange={(e) => setRobotsDirectives(e.target.value)}
                    className="mt-1 h-9 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)]"
                  >
                    <option value="index, follow">index, follow (Default)</option>
                    <option value="noindex, follow">noindex, follow</option>
                    <option value="index, nofollow">index, nofollow</option>
                    <option value="noindex, nofollow">noindex, nofollow</option>
                  </select>
                </div>
              </div>
            </div>
          ) : (
            /* Settings & Social Tab */
            <div className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6">
              <h3 className="text-base font-semibold text-[var(--text)]">Social Sharing & Advanced Settings</h3>

              <div>
                <label className="block text-[13px] font-medium text-[var(--text)]">Open Graph Title</label>
                <Input
                  value={ogTitle}
                  onChange={(e) => setOgTitle(e.target.value)}
                  placeholder={title || "Defaults to SEO title"}
                  className="mt-1 text-[13px]"
                />
              </div>

              <div>
                <label className="block text-[13px] font-medium text-[var(--text)]">Open Graph Description</label>
                <textarea
                  value={ogDescription}
                  onChange={(e) => setOgDescription(e.target.value)}
                  rows={2}
                  placeholder={excerpt || "Defaults to SEO description"}
                  className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3 text-[13px] text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[13px] font-medium text-[var(--text)]">Custom Social Card Image URL</label>
                <Input
                  value={ogImage}
                  onChange={(e) => setOgImage(e.target.value)}
                  placeholder="https://.../card.jpg (defaults to featured image)"
                  className="mt-1 text-[13px]"
                />
              </div>

              <div className="flex flex-col gap-3 pt-2">
                <label className="flex items-center gap-2 text-[13px] text-[var(--text)]">
                  <input
                    type="checkbox"
                    checked={allowComments}
                    onChange={(e) => setAllowComments(e.target.checked)}
                    className="rounded border-[var(--border)]"
                  />
                  <span>Allow reader comments on this article</span>
                </label>

                <label className="flex items-center gap-2 text-[13px] text-[var(--text)]">
                  <input
                    type="checkbox"
                    checked={isFeatured}
                    onChange={(e) => setIsFeatured(e.target.checked)}
                    className="rounded border-[var(--border)]"
                  />
                  <span>Pin as featured article at top of blog index</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Right Column (4 cols): Publishing Controls & Health Card */}
        <div className="space-y-4 lg:col-span-4">
          {/* Publishing Card */}
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
            <h3 className="text-[14px] font-semibold text-[var(--text)]">Publishing Workflow</h3>

            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-subtle)]">Workflow Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="mt-1 h-9 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] font-medium text-[var(--text)]"
                >
                  <option value="draft">Draft</option>
                  <option value="pending_review">Pending Review</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </div>

              {status === "scheduled" && (
                <div className="rounded-[var(--radius-md)] border border-[var(--info)]/30 bg-[var(--info-soft)] p-3">
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--info)]">
                    <Clock size={13} />
                    <span>Scheduled Publication</span>
                  </div>
                  <input
                    type="datetime-local"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="mt-2 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[12px] text-[var(--text)]"
                  />
                  <p className="mt-1 text-[10px] text-[var(--text-subtle)]">Will auto-publish via background queue.</p>
                </div>
              )}

              {/* Category */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[12px] font-medium text-[var(--text-subtle)]">Category</label>
                  <button
                    type="button"
                    onClick={() => setShowAddCategory(!showAddCategory)}
                    className="text-[11px] font-medium text-[var(--primary)] hover:underline"
                  >
                    + Add New
                  </button>
                </div>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="mt-1 h-9 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)]"
                >
                  {categoryList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                {showAddCategory && (
                  <div className="mt-2 flex gap-1.5">
                    <Input
                      size="sm"
                      placeholder="Category name"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      className="text-[12px]"
                    />
                    <Button size="sm" variant="primary" onClick={handleCreateCategory}>
                      Add
                    </Button>
                  </div>
                )}
              </div>

              {/* Author */}
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-subtle)]">Author Profile</label>
                <select
                  value={authorId}
                  onChange={(e) => setAuthorId(e.target.value)}
                  className="mt-1 h-9 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)]"
                >
                  {authors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-subtle)]">Tags</label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {availableTags.map((tag) => {
                    const active = selectedTagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => {
                          if (active) setSelectedTagIds(selectedTagIds.filter((t) => t !== tag.id));
                          else setSelectedTagIds([...selectedTagIds, tag.id]);
                        }}
                        className={`flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-0.5 text-[11px] font-medium transition-colors ${
                          active
                            ? "bg-[var(--primary)] text-[var(--primary-text)]"
                            : "bg-[var(--surface-hover)] text-[var(--text-muted)] hover:text-[var(--text)]"
                        }`}
                      >
                        <span>#{tag.name}</span>
                        {active && <Check size={10} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Featured Image Card */}
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
            <h3 className="text-[14px] font-semibold text-[var(--text)]">Featured Image</h3>
            <p className="text-[11px] text-[var(--text-muted)]">Displayed on blog index, article header, and social links.</p>

            <div className="mt-3">
              {featuredImage ? (
                <div className="space-y-2">
                  <div className="relative aspect-[16/9] w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]">
                    <img src={featuredImage} alt={featuredImageAlt || ""} className="h-full w-full object-cover" />
                  </div>
                  <Input
                    placeholder="Image Alt Text (SEO)..."
                    value={featuredImageAlt}
                    onChange={(e) => setFeaturedImageAlt(e.target.value)}
                    className="text-[12px]"
                  />
                  <Input
                    placeholder="Caption (optional)..."
                    value={featuredImageCaption}
                    onChange={(e) => setFeaturedImageCaption(e.target.value)}
                    className="text-[12px]"
                  />
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setMediaPickerTarget("featured");
                        setMediaPickerOpen(true);
                      }}
                      className="flex-1 text-[12px]"
                    >
                      Change
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setFeaturedImage("");
                        setFeaturedImageAlt("");
                        setFeaturedImageCaption("");
                      }}
                      className="text-[12px] text-[var(--danger)]"
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => {
                    setMediaPickerTarget("featured");
                    setMediaPickerOpen(true);
                  }}
                  className="flex cursor-pointer flex-col items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--border)] p-6 text-center hover:border-[var(--primary)] hover:bg-[var(--surface-hover)]"
                >
                  <ImageIcon size={24} className="text-[var(--text-subtle)]" />
                  <p className="mt-2 text-[12px] font-medium text-[var(--text)]">Set Featured Image</p>
                  <p className="text-[10px] text-[var(--text-subtle)]">Recommended: 1200 x 630px</p>
                </div>
              )}
            </div>
          </div>

          {/* SEO Checklist Card */}
          <SeoChecklistCard
            score={seoAnalysis.score}
            checks={seoAnalysis.checks}
            wordCount={seoAnalysis.wordCount}
            readMins={seoAnalysis.estimatedReadMins}
          />
        </div>
      </div>

      {/* Media Picker Modal */}
      <MediaPickerModal
        open={mediaPickerOpen}
        onOpenChange={setMediaPickerOpen}
        onSelect={(media) => {
          if (mediaPickerTarget === "featured") {
            setFeaturedImage(media.url);
            if (media.altText) setFeaturedImageAlt(media.altText);
          } else {
            insertTextAtCursor(`\n![${media.altText || "Image"}](${media.url})\n`);
          }
        }}
      />

      {/* SERP & Social Preview Modal */}
      <SeoPreviewModal
        open={seoPreviewOpen}
        onOpenChange={setSeoPreviewOpen}
        title={seoTitle || title}
        slug={slug}
        metaDescription={seoDescription || excerpt}
        featuredImage={featuredImage}
      />

      {/* Responsive Live Layout Preview Modal */}
      <BlogPreviewModal
        open={blogPreviewOpen}
        onOpenChange={setBlogPreviewOpen}
        post={{
          title,
          subtitle,
          content,
          excerpt,
          authorName: authors.find((a) => a.id === authorId)?.name,
          categoryName: categoryList.find((c) => c.id === categoryId)?.name,
          readMins: seoAnalysis.estimatedReadMins,
          featuredImage,
          featuredImageCaption,
        }}
      />

      {/* Revision History Modal */}
      {postId && (
        <RevisionHistoryModal
          open={revisionModalOpen}
          onOpenChange={setRevisionModalOpen}
          postId={postId}
          revisions={revisions}
          onRestored={(rev) => {
            setTitle(rev.title);
            setContent(rev.content);
            if (rev.excerpt) setExcerpt(rev.excerpt);
            setRevisions([
              {
                id: `rev-${Date.now()}`,
                title: rev.title,
                content: rev.content,
                excerpt: rev.excerpt,
                summary: `Restored version from ${new Date(rev.createdAt).toLocaleString()}`,
                createdAt: new Date().toISOString(),
              },
              ...revisions,
            ]);
          }}
        />
      )}
    </div>
  );
}
