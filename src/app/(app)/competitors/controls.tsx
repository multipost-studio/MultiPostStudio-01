"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Select, Field } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { PLATFORM_KEYS, PLATFORMS } from "@/lib/constants";
import { addCompetitorAction, removeCompetitorAction } from "@/app/actions/intelligence";

function Add() {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  async function submit(fd: FormData) {
    setPending(true);
    const res = await addCompetitorAction(null, fd);
    setPending(false);
    if (res.ok) {
      toast({ title: res.message ?? "Added", tone: "success" });
      setOpen(false);
      router.refresh();
    } else {
      toast({ title: "Failed", description: res.error, tone: "error" });
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus size={15} /> Add competitor
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Track a competitor"
        description="Public accounts only. We never access private data or scrape against platform terms."
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" type="submit" form="add-comp" loading={pending}>Add</Button>
          </>
        }
      >
        <form id="add-comp" action={submit} className="space-y-3">
          <Field label="Name">
            <Input name="name" required placeholder="Blue Ridge Roasters" />
          </Field>
          <Field label="Handle">
            <Input name="handle" required placeholder="@blueridge" />
          </Field>
          <Field label="Platform">
            <Select name="platform" defaultValue="instagram">
              {PLATFORM_KEYS.map((p) => (
                <option key={p} value={p}>{PLATFORMS[p].label}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
            <Field label="Followers">
              <Input name="followerCount" type="number" min="0" placeholder="0" />
            </Field>
            <Field label="Posts / week">
              <Input name="postsPerWeek" type="number" min="0" step="0.1" placeholder="0" />
            </Field>
            <Field label="Avg engagement %">
              <Input name="avgEngagement" type="number" min="0" step="0.01" placeholder="0" />
            </Field>
          </div>
          <Field label="Notes (optional)">
            <Input name="notes" placeholder="What they do well, cadence, formats…" />
          </Field>
          <p className="text-[12px] text-[var(--text-subtle)]">
            Enter figures from the competitor&apos;s public profile. Leave blank if unknown —
            nothing is estimated for you.
          </p>
        </form>
      </Modal>
    </>
  );
}

function Remove({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  return (
    <Button
      size="icon"
      variant="ghost"
      aria-label="Remove competitor"
      loading={pending}
      onClick={async () => {
        setPending(true);
        await removeCompetitorAction(id);
        router.refresh();
      }}
    >
      <Trash2 size={14} />
    </Button>
  );
}

import { Sparkles } from "lucide-react";
import {
  aiCompetitorGapAnalysisAction,
  addCompetitorPostAction,
} from "@/app/actions/intelligence";

function Analyze({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const { toast } = useToast();

  async function handleAnalyze() {
    setPending(true);
    const res = await aiCompetitorGapAnalysisAction(id);
    setPending(false);
    if (res.ok) {
      toast({ title: "Gap analysis generated", tone: "success" });
      router.refresh();
    } else {
      toast({ title: "Analysis failed", description: res.error, tone: "error" });
    }
  }

  return (
    <Button
      size="sm"
      variant="secondary"
      loading={pending}
      onClick={handleAnalyze}
      title="Generate AI gap analysis against your performance"
    >
      <Sparkles size={13} className="text-indigo-500 mr-1" />
      AI Gap Analysis
    </Button>
  );
}

function AddPost({ competitorId }: { competitorId: string }) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [caption, setCaption] = React.useState("");
  const [format, setFormat] = React.useState("image");
  const [engagement, setEngagement] = React.useState("");
  const { toast } = useToast();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!caption.trim()) return;
    setPending(true);
    const res = await addCompetitorPostAction({
      competitorId,
      caption: caption.trim(),
      format,
      engagement: parseInt(engagement, 10) || 0,
    });
    setPending(false);
    if (res.ok) {
      toast({ title: "Post added", tone: "success" });
      setOpen(false);
      setCaption("");
      setEngagement("");
      router.refresh();
    } else {
      toast({ title: "Failed to add post", description: res.error, tone: "error" });
    }
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Plus size={13} /> Add top post
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add competitor top post"
        description="Record a public post from this competitor to extract themes and benchmark formats."
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" type="submit" form={`add-post-${competitorId}`} loading={pending}>Save Post</Button>
          </>
        }
      >
        <form id={`add-post-${competitorId}`} onSubmit={handleSubmit} className="space-y-3">
          <Field label="Caption / Topic">
            <Input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="e.g. New cold brew packaging announcement..."
              required
            />
          </Field>
          <Field label="Format">
            <Select value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="image">Image</option>
              <option value="carousel">Carousel</option>
              <option value="reel">Reel / Video</option>
              <option value="text">Text Post</option>
            </Select>
          </Field>
          <Field label="Engagement (Likes + Comments)">
            <Input
              type="number"
              min="0"
              value={engagement}
              onChange={(e) => setEngagement(e.target.value)}
              placeholder="0"
            />
          </Field>
        </form>
      </Modal>
    </>
  );
}

// NOTE: named exports, not a namespace object. { A, B } accessed via property
// in a Server Component breaks across the RSC boundary ("Element type is invalid").
export { Add as CompAdd, Remove as CompRemove, Analyze as CompAnalyze, AddPost as CompAddPost };

