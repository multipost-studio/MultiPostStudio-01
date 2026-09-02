"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Select, Field } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { createCampaignAction } from "@/app/actions/campaigns";

function New({ open: initialOpen }: { open?: boolean }) {
  const [open, setOpen] = React.useState(!!initialOpen);
  const [pending, setPending] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus size={15} /> New campaign
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New campaign"
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" type="submit" form="new-campaign" loading={pending}>Create</Button>
          </>
        }
      >
        <form
          id="new-campaign"
          className="space-y-3"
          action={async (fd) => {
            setPending(true);
            const res = await createCampaignAction(null, fd);
            setPending(false);
            if (res.ok) {
              toast({ title: "Campaign created", tone: "success" });
              setOpen(false);
              router.push(`/campaigns/${res.data}`);
            } else {
              toast({ title: "Failed", description: res.error, tone: "error" });
            }
          }}
        >
          <Field label="Name">
            <Input name="name" required placeholder="Spring Launch" />
          </Field>
          <Field label="Objective">
            <Select name="objective" defaultValue="awareness">
              {["awareness", "engagement", "leads", "sales", "launch"].map((o) => (
                <option key={o}>{o}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Start date">
              <Input name="startDate" type="date" />
            </Field>
            <Field label="End date">
              <Input name="endDate" type="date" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Goal: posts">
              <Input name="goalPosts" type="number" min={0} placeholder="24" />
            </Field>
            <Field label="Goal: engagement">
              <Input name="goalEngagement" type="number" min={0} placeholder="5000" />
            </Field>
          </div>
        </form>
      </Modal>
    </>
  );
}

// NOTE: named exports, not a namespace object. { A, B } accessed via property
// in a Server Component breaks across the RSC boundary ("Element type is invalid").
export { New as CampNew };
