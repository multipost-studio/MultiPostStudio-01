import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { parseJson } from "@/lib/utils";
import { INDUSTRIES } from "@/lib/constants";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { ActionForm, SettingsSection } from "../_form";
import { updateWorkspaceAction } from "@/app/actions/workspace";
import { QueueScheduleEditor } from "./queue-schedule";

export const metadata: Metadata = { title: "Workspace settings" };

export default async function WorkspaceSettingsPage() {
  const ctx = await requireWorkspace();
  const ws = ctx.active.workspace;
  const canManage = can(ctx.active.role, "workspace.manage");
  const colors = parseJson<string[]>(ws.brandColors, []);

  const channels = await db.socialChannel.findMany({
    where: { workspaceId: ws.id },
    include: { queueSlots: true },
    orderBy: { platform: "asc" },
  });

  return (
    <>
      <SettingsSection title="Workspace details" description="Name, industry and brand identity for this workspace.">
        {canManage ? (
          <ActionForm action={updateWorkspaceAction}>
            <Field label="Workspace name">
              <Input name="name" defaultValue={ws.name} required />
            </Field>
            <Field label="Industry">
              <Select name="industry" defaultValue={ws.industry ?? INDUSTRIES[0]}>
                {INDUSTRIES.map((i) => (
                  <option key={i}>{i}</option>
                ))}
              </Select>
            </Field>
            <Field label="Website">
              <Input name="websiteUrl" type="url" defaultValue={ws.websiteUrl ?? ""} placeholder="https://" />
            </Field>
            <Field label="Brand colors" hint="Comma-separated hex values">
              <Input name="brandColors" defaultValue={colors.join(", ")} placeholder="#8A2D4D, #B85F33" />
            </Field>
            <Field label="Brand voice">
              <Textarea name="brandVoice" defaultValue={ws.brandVoice ?? ""} placeholder="Confident, plainspoken, a little witty." />
            </Field>
          </ActionForm>
        ) : (
          <p className="text-[14px] text-[var(--text-muted)]">You need manager access to edit workspace settings.</p>
        )}
      </SettingsSection>

      <SettingsSection title="Posting schedule" description="Define the weekly time slots each channel publishes into.">
        <QueueScheduleEditor
          canEdit={can(ctx.active.role, "content.publish")}
          channels={channels.map((c) => ({
            id: c.id,
            name: c.name,
            platform: c.platform,
            slots: c.queueSlots.map((s) => ({ weekday: s.weekday, hour: s.hour, minute: s.minute })),
          }))}
        />
      </SettingsSection>
    </>
  );
}
