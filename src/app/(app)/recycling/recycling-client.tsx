"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Select, Field } from "@/components/ui/input";
import { Switch } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";
import {
  createRecycleRuleAction,
  toggleRecycleRuleAction,
  deleteRecycleRuleAction,
  assignPostToRuleAction,
} from "@/app/actions/misc";

function NewRule() {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus size={15} /> New rule
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New recycling rule"
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" type="submit" form="new-rule" loading={pending}>Create</Button>
          </>
        }
      >
        <form
          id="new-rule"
          className="space-y-3"
          action={async (fd) => {
            setPending(true);
            const res = await createRecycleRuleAction(null, fd);
            setPending(false);
            toast({ title: res.ok ? "Created" : "Failed", description: res.error, tone: res.ok ? "success" : "error" });
            if (res.ok) { setOpen(false); router.refresh(); }
          }}
        >
          <Field label="Name">
            <Input name="name" required placeholder="Evergreen education" />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Every (days)">
              <Input name="frequencyDays" type="number" defaultValue={30} min={1} />
            </Field>
            <Field label="Max reposts">
              <Input name="maxReposts" type="number" defaultValue={4} min={1} />
            </Field>
            <Field label="Min gap (days)">
              <Input name="minGapDays" type="number" defaultValue={21} min={1} />
            </Field>
          </div>
        </form>
      </Modal>
    </>
  );
}

function RuleRow({ id, enabled }: { id: string; enabled: boolean }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={enabled}
        onCheckedChange={async (v) => {
          await toggleRecycleRuleAction(id, v);
          router.refresh();
        }}
      />
      <Button
        size="icon"
        variant="ghost"
        aria-label="Delete rule"
        onClick={async () => {
          await deleteRecycleRuleAction(id);
          router.refresh();
        }}
      >
        <Trash2 size={13} />
      </Button>
    </div>
  );
}

function MarkEvergreen({
  postId,
  rules,
  attached,
}: {
  postId: string;
  rules: { id: string; name: string }[];
  attached?: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  return (
    <Select
      value={attached ?? ""}
      onChange={async (e) => {
        const res = await assignPostToRuleAction(postId, e.target.value || null);
        toast({ title: res.message ?? "Updated", tone: res.ok ? "success" : "error" });
        router.refresh();
      }}
      className="h-8 w-auto text-[13px]"
    >
      <option value="">Not recycling</option>
      {rules.map((r) => (
        <option key={r.id} value={r.id}>{r.name}</option>
      ))}
    </Select>
  );
}

// NOTE: named exports, not a namespace object. { A, B } accessed via property
// in a Server Component breaks across the RSC boundary ("Element type is invalid").
export { NewRule as RecycNewRule, RuleRow as RecycRuleRow, MarkEvergreen as RecycMarkEvergreen };
