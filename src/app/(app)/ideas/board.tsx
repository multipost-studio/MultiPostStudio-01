"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Plus, Link2, Video, Mic, FileText, GripVertical } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { IDEA_STAGES, IDEA_STAGE_LABELS, type IdeaStage } from "@/lib/constants";
import {
  createIdeaAction,
  moveIdeaStageAction,
  archiveIdeaAction,
  convertIdeaAction,
} from "@/app/actions/ideas";

type Idea = {
  id: string;
  title: string;
  notes: string | null;
  kind: string;
  url: string | null;
  stage: string;
  sortIndex: number;
  author: string;
  pillar: { name: string; color: string } | null;
  tags: string[];
};

const KIND_ICON: Record<string, React.ReactNode> = {
  link: <Link2 size={12} />,
  video: <Video size={12} />,
  voice: <Mic size={12} />,
  text: <FileText size={12} />,
  image: <FileText size={12} />,
};

export function IdeasBoard({
  ideas: initial,
  pillars,
  campaigns,
  canEdit,
  openNew,
}: {
  ideas: Idea[];
  pillars: { id: string; name: string }[];
  campaigns: { id: string; name: string }[];
  canEdit: boolean;
  openNew: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [ideas, setIdeas] = React.useState(initial);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [newOpen, setNewOpen] = React.useState(openNew);
  const [detail, setDetail] = React.useState<Idea | null>(null);

  React.useEffect(() => setIdeas(initial), [initial]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const byStage = (s: string) => ideas.filter((i) => i.stage === s).sort((a, b) => a.sortIndex - b.sortIndex);

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const id = String(e.active.id);
    const overStage = e.over?.id ? String(e.over.id) : null;
    if (!overStage) return;
    const idea = ideas.find((i) => i.id === id);
    if (!idea || idea.stage === overStage) return;

    const newIndex = byStage(overStage).length;
    setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, stage: overStage, sortIndex: newIndex } : i)));
    const res = await moveIdeaStageAction(id, overStage, newIndex);
    if (!res.ok) {
      toast({ title: "Couldn't move idea", description: res.error, tone: "error" });
      setIdeas(initial);
    } else {
      router.refresh();
    }
  }

  const activeIdea = ideas.find((i) => i.id === activeId) ?? null;

  return (
    <>
      <PageHeader
        title="Ideas"
        description="Capture, research and shape content before it becomes a post. Drag between columns."
        actions={
          canEdit && (
            <Button size="sm" onClick={() => setNewOpen(true)}>
              <Plus size={15} /> New idea
            </Button>
          )
        }
      />

      {ideas.length === 0 ? (
        <EmptyState
          icon={<FileText size={18} />}
          title="No ideas yet"
          description="Every great post starts as a rough idea. Capture one now."
          action={canEdit && <Button size="sm" onClick={() => setNewOpen(true)}>Add your first idea</Button>}
        />
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-4">
            {IDEA_STAGES.map((stage) => (
              <Column
                key={stage}
                stage={stage}
                ideas={byStage(stage)}
                onOpen={setDetail}
                canEdit={canEdit}
              />
            ))}
          </div>
          <DragOverlay>{activeIdea ? <IdeaCard idea={activeIdea} dragging /> : null}</DragOverlay>
        </DndContext>
      )}

      {/* New idea modal */}
      <NewIdeaModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        pillars={pillars}
        campaigns={campaigns}
        onCreated={() => {
          setNewOpen(false);
          router.refresh();
        }}
      />

      {/* Detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.title} size="md">
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{KIND_ICON[detail.kind]} {detail.kind}</Badge>
              {detail.pillar && (
                <Badge tone="primary">
                  <span className="h-2 w-2 rounded-full" style={{ background: detail.pillar.color }} />
                  {detail.pillar.name}
                </Badge>
              )}
              {detail.tags.map((t) => (
                <Badge key={t}>#{t}</Badge>
              ))}
            </div>
            {detail.url && (
              <a href={detail.url} target="_blank" rel="noreferrer" className="block truncate text-[14px] text-[var(--primary)] hover:underline">
                {detail.url}
              </a>
            )}
            <p className="whitespace-pre-wrap text-[14px] text-[var(--text-muted)]">
              {detail.notes || "No notes."}
            </p>
            <p className="text-[13px] text-[var(--text-subtle)]">Added by {detail.author}</p>
            {canEdit && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    await convertIdeaAction(detail.id);
                  }}
                >
                  Convert to post
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await archiveIdeaAction(detail.id);
                    setDetail(null);
                    router.refresh();
                  }}
                >
                  Archive
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

function Column({
  stage,
  ideas,
  onOpen,
  canEdit,
}: {
  stage: IdeaStage;
  ideas: Idea[];
  onOpen: (i: Idea) => void;
  canEdit: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div className="flex w-[280px] shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-[13px] font-semibold text-[var(--text)]">{IDEA_STAGE_LABELS[stage]}</p>
        <span className="rounded-full bg-[var(--bg-sunken)] px-1.5 text-[12px] text-[var(--text-subtle)] tabular-nums">
          {ideas.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[120px] flex-1 flex-col gap-2 rounded-[var(--radius-lg)] border border-dashed p-2 transition-colors",
          isOver ? "border-[var(--primary)] bg-[var(--primary-soft)]/30" : "border-[var(--border)] bg-[var(--bg-sunken)]/40",
        )}
      >
        {ideas.map((idea) => (
          <DraggableCard key={idea.id} idea={idea} onOpen={onOpen} canEdit={canEdit} />
        ))}
      </div>
    </div>
  );
}

function DraggableCard({ idea, onOpen, canEdit }: { idea: Idea; onOpen: (i: Idea) => void; canEdit: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: idea.id, disabled: !canEdit });
  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn(isDragging && "opacity-40")}
    >
      <div className="flex items-start gap-1">
        {canEdit && (
          <button {...listeners} {...attributes} className="mt-2 cursor-grab text-[var(--text-subtle)] active:cursor-grabbing" aria-label="Drag">
            <GripVertical size={13} />
          </button>
        )}
        <button onClick={() => onOpen(idea)} className="flex-1 text-left">
          <IdeaCard idea={idea} />
        </button>
      </div>
    </div>
  );
}

function IdeaCard({ idea, dragging }: { idea: Idea; dragging?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-2.5 shadow-sm",
        dragging && "shadow-lg",
      )}
    >
      <p className="text-[14px] font-medium text-[var(--text)] line-clamp-2">{idea.title}</p>
      {idea.notes && <p className="mt-1 text-[12px] text-[var(--text-muted)] line-clamp-2">{idea.notes}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-subtle)]">
          {KIND_ICON[idea.kind]} {idea.kind}
        </span>
        {idea.pillar && (
          <span className="inline-flex items-center gap-1 rounded-full px-1.5 text-[11px]" style={{ color: idea.pillar.color }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: idea.pillar.color }} />
            {idea.pillar.name}
          </span>
        )}
      </div>
    </div>
  );
}

function NewIdeaModal({
  open,
  onClose,
  pillars,
  campaigns,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  pillars: { id: string; name: string }[];
  campaigns: { id: string; name: string }[];
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [pending, setPending] = React.useState(false);

  async function submit(formData: FormData) {
    setPending(true);
    const res = await createIdeaAction(null, formData);
    setPending(false);
    if (res.ok) {
      toast({ title: "Idea added", tone: "success" });
      onCreated();
    } else {
      toast({ title: "Couldn't add idea", description: res.error, tone: "error" });
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New idea"
      description="A rough thought is enough — you can shape it later."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" type="submit" form="new-idea" loading={pending}>
            Add idea
          </Button>
        </>
      }
    >
      <form id="new-idea" action={submit} className="space-y-4">
        <Field label="Title">
          <Input name="title" required autoFocus placeholder="e.g. 5 pour-over mistakes" />
        </Field>
        <Field label="Notes">
          <Textarea name="notes" placeholder="Angle, references, hooks…" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <Select name="kind" defaultValue="text">
              <option value="text">Text</option>
              <option value="link">Link</option>
              <option value="image">Image</option>
              <option value="video">Video</option>
              <option value="voice">Voice note</option>
            </Select>
          </Field>
          <Field label="Link (optional)">
            <Input name="url" type="url" placeholder="https://" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Content pillar">
            <Select name="pillarId" defaultValue="">
              <option value="">None</option>
              {pillars.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Campaign">
            <Select name="campaignId" defaultValue="">
              <option value="">None</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </form>
    </Modal>
  );
}
