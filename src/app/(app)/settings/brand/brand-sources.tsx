"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { relativeTime } from "@/lib/utils";
import { addBrandSourceAction, deleteBrandSourceAction } from "@/app/actions/workspace";

type Source = { id: string; kind: string; title: string; content: string; status: string; createdAt: string };

export function BrandSources({ sources, canManage }: { sources: Source[]; canManage: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  return (
    <div className="space-y-3">
      {sources.length === 0 && <p className="text-[14px] text-[var(--text-muted)]">No sources yet.</p>}
      {sources.map((s) => (
        <div key={s.id} className="rounded-[var(--radius-md)] border border-[var(--border)] p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge tone="neutral">{s.kind.replace(/_/g, " ")}</Badge>
              <span className="text-[14px] font-medium text-[var(--text)]">{s.title}</span>
            </div>
            {canManage && (
              <Button
                size="icon"
                variant="ghost"
                aria-label="Delete source"
                onClick={async () => {
                  await deleteBrandSourceAction(s.id);
                  router.refresh();
                }}
              >
                <Trash2 size={13} />
              </Button>
            )}
          </div>
          <p className="mt-1 text-[13px] text-[var(--text-muted)] line-clamp-2">{s.content}</p>
          <p className="mt-1 text-[11px] text-[var(--text-subtle)]">Added {relativeTime(s.createdAt)}</p>
        </div>
      ))}

      {canManage && (
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <Plus size={14} /> Add source
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add a Brand Brain source"
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" type="submit" form="add-source" loading={pending}>Add</Button>
          </>
        }
      >
        <form
          id="add-source"
          className="space-y-3"
          action={async (fd) => {
            setPending(true);
            const res = await addBrandSourceAction(null, fd);
            setPending(false);
            toast({ title: res.ok ? res.message ?? "Added" : "Failed", description: res.error, tone: res.ok ? "success" : "error" });
            if (res.ok) { setOpen(false); router.refresh(); }
          }}
        >
          <Field label="Type">
            <Select name="kind" defaultValue="document">
              <option value="website">Website content</option>
              <option value="guidelines">Brand guidelines</option>
              <option value="past_posts">Past posts</option>
              <option value="example">Approved example</option>
              <option value="document">Document</option>
            </Select>
          </Field>
          <Field label="Title">
            <Input name="title" required placeholder="Brand voice guide" />
          </Field>
          <Field label="Content">
            <Textarea name="content" required className="min-h-[140px]" placeholder="Paste the text the AI should learn from…" />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
