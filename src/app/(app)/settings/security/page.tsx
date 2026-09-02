import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { Input, Field } from "@/components/ui/input";
import { ActionForm, SettingsSection } from "../_form";
import { changePasswordAction } from "@/app/actions/settings";
import { TwoFactorToggle } from "./two-factor";

export const metadata: Metadata = { title: "Security settings" };

export default async function SecuritySettingsPage() {
  const user = await requireUser();
  const record = await db.user.findUnique({ where: { id: user.id }, select: { twoFactorEnabled: true } });

  return (
    <>
      <SettingsSection title="Password" description="Use a strong, unique password.">
        <ActionForm action={changePasswordAction} submitLabel="Change password">
          <Field label="Current password">
            <Input name="current" type="password" autoComplete="current-password" required />
          </Field>
          <Field label="New password" hint="At least 8 characters">
            <Input name="next" type="password" autoComplete="new-password" required />
          </Field>
        </ActionForm>
      </SettingsSection>

      <SettingsSection title="Two-factor authentication" description="Add a second step to sign in.">
        <TwoFactorToggle enabled={record?.twoFactorEnabled ?? false} />
      </SettingsSection>

      <SettingsSection title="Sessions" description="You're signed in on this device. Manage all devices under Devices.">
        <p className="text-[14px] text-[var(--text-muted)]">
          Signing out here ends only the current session. Revoke others from the Devices tab.
        </p>
      </SettingsSection>
    </>
  );
}
