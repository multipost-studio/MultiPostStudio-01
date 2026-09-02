"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Select, Field } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { updateCampaignAction, deleteCampaignAction } from "@/app/actions/campaigns";

export function CampaignDetailClient({
  id,
  name,
  status,
  objective,
}: {
  id: string;
  name: string;
  status: string;
  objective: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Settings2 size={14} /> Edit
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit campaign"
        footer={
          <div className="flex w-full items-center justify-between">
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await deleteCampaignAction(id);
                toast({ title: "Campaign deleted", tone: "success" });
                router.push("/campaigns");
              }}
            >
              <Trash2 size={13} /> Delete
            </Button>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                loading={pending}
                onClick={async () => {
                  setPending(true);
                  const form = document.getElementById("edit-campaign") as HTMLFormElement;
                  const fd = new FormData(form);
                  const res = await updateCampaignAction(id, {
                    name: String(fd.get("name")),
                    objective: fd.get("objective") as "awareness",
                    status: String(fd.get("status")),
                  });
                  setPending(false);
                  toast({ title: res.ok ? "Saved" : "Failed", description: res.error, tone: res.ok ? "success" : "error" });
                  if (res.ok) { setOpen(false); router.refresh(); }
                }}
              >
                Save
              </Button>
            </div>
          </div>
        }
      >
        <form id="edit-campaign" className="space-y-3">
          <Field label="Name">
            <Input name="name" defaultValue={name} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Objective">
              <Select name="objective" defaultValue={objective}>
                {["awareness", "engagement", "leads", "sales", "launch"].map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select name="status" defaultValue={status}>
                {["planning", "active", "completed", "archived"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
          </div>
        </form>
      </Modal>
    </>
  );
}
