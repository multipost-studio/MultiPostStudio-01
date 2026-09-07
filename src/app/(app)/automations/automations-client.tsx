"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Select, Field } from "@/components/ui/input";
import { Switch } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";
import {
  createAutomationAction,
  toggleAutomationAction,
  deleteAutomationAction,
  runAutomationsNowAction,
} from "@/app/actions/automations";
import {
  TRIGGERS,
  TRIGGER_LABEL,
  ACTION_LABEL,
  actionsFor,
  usesThreshold,
  type TriggerType,
} from "@/lib/automations";

function New() {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  // The action list follows the trigger: only pairs the engine implements are
  // offered, so an automation can't be created that will never run.
  const [trigger, setTrigger] = React.useState<TriggerType>(TRIGGERS[0]);
  const { toast } = useToast();
  const router = useRouter();
  const actions = actionsFor(trigger);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus size={15} /> New automation
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New automation"
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" type="submit" form="new-auto" loading={pending}>Create</Button>
          </>
        }
      >
        <form
          id="new-auto"
          className="space-y-3"
          action={async (fd) => {
            setPending(true);
            const res = await createAutomationAction(null, fd);
            setPending(false);
            toast({ title: res.ok ? "Created" : "Failed", description: res.error, tone: res.ok ? "success" : "error" });
            if (res.ok) { setOpen(false); router.refresh(); }
          }}
        >
          <Field label="Name">
            <Input name="name" required placeholder="Alert on publish failures" />
          </Field>
          <Field label="WHEN (trigger)">
            <Select
              name="triggerType"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value as TriggerType)}
            >
              {TRIGGERS.map((t) => (
                <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>
              ))}
            </Select>
          </Field>
          <Field label="THEN (action)">
            {/* Keyed on the trigger so the browser resets the selection when the
                options change, rather than keeping an action from the old list. */}
            <Select key={trigger} name="actionType" defaultValue={actions[0]}>
              {actions.map((act) => (
                <option key={act} value={act}>{ACTION_LABEL[act]}</option>
              ))}
            </Select>
          </Field>
          {usesThreshold(trigger) && (
            <Field label="Engagement threshold (%)" hint="Optional — defaults to 5%">
              <Input name="threshold" type="number" min={0} step={0.5} placeholder="5" />
            </Field>
          )}
        </form>
      </Modal>
    </>
  );
}

function Toolbar() {
  const [pending, setPending] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();
  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="secondary"
        loading={pending}
        onClick={async () => {
          setPending(true);
          const res = await runAutomationsNowAction();
          setPending(false);
          toast({ title: res.message ?? "Ran", tone: "success" });
          router.refresh();
        }}
      >
        <Play size={14} /> Run now
      </Button>
      <New />
    </div>
  );
}

function Row({ id, enabled }: { id: string; enabled: boolean }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-3">
      <Switch
        checked={enabled}
        onCheckedChange={async (v) => {
          await toggleAutomationAction(id, v);
          router.refresh();
        }}
        label={enabled ? "On" : "Off"}
      />
      <Button
        size="icon"
        variant="ghost"
        aria-label="Delete automation"
        onClick={async () => {
          await deleteAutomationAction(id);
          router.refresh();
        }}
      >
        <Trash2 size={14} />
      </Button>
    </div>
  );
}

// NOTE: named exports, not a namespace object. { A, B } accessed via property
// in a Server Component breaks across the RSC boundary ("Element type is invalid").
export { New as AutomNew, Toolbar as AutomToolbar, Row as AutomRow };
