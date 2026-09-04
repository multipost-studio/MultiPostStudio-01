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
          <div className="grid grid-cols-3 gap-2">
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

// NOTE: named exports, not a namespace object. { A, B } accessed via property
// in a Server Component breaks across the RSC boundary ("Element type is invalid").
export { Add as CompAdd, Remove as CompRemove };
