"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
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
            <Input name="name" required placeholder="Spring Launch 2026" />
          </Field>
          <Field label="Objective">
            <Select name="objective" defaultValue="awareness">
              {["awareness", "engagement", "leads", "sales", "launch"].map((o) => (
                <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Campaign Brief / Description">
            <Textarea
              name="description"
              placeholder="Outline the core thesis, themes, and goals of this campaign..."
              className="min-h-[70px] text-[13.5px]"
            />
          </Field>
          <Field label="Target Audience">
            <Input name="targetAudience" placeholder="e.g. B2B SaaS Founders, Engineering Leads" />
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
            <Field label="Primary KPI Metric">
              <Select name="kpiMetric" defaultValue="clicks">
                <option value="clicks">Link Clicks</option>
                <option value="impressions">Impressions</option>
                <option value="reach">Audience Reach</option>
                <option value="engagement">Engagement</option>
                <option value="conversions">Conversions</option>
                <option value="leads">Leads</option>
              </Select>
            </Field>
            <Field label="Target KPI Value">
              <Input name="kpiTarget" type="number" min={0} placeholder="10000" />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Goal: posts">
              <Input name="goalPosts" type="number" min={0} placeholder="24" />
            </Field>
            <Field label="Goal: engagement">
              <Input name="goalEngagement" type="number" min={0} placeholder="5000" />
            </Field>
            <Field label="Budget ($)">
              <Input name="budgetCents" type="number" min={0} placeholder="1500" />
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
