import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { Input, Field } from "@/components/ui/input";
import { ActionForm, SettingsSection } from "../_form";
import { updateProfileAction } from "@/app/actions/settings";
import { timezoneOptions } from "@/lib/timezones";
import { EmailVerifyNotice } from "./email-verify";
import { TimezoneField } from "./timezone-field";

export const metadata: Metadata = { title: "Profile settings" };

export default async function ProfileSettingsPage() {
  const user = await requireUser();
  const zones = timezoneOptions();

  return (
    <>
      <SettingsSection title="Your profile" description="This information is visible to your team.">
        <ActionForm action={updateProfileAction}>
          <Field label="Full name" htmlFor="name">
            <Input id="name" name="name" defaultValue={user.name} required minLength={2} maxLength={80} autoComplete="name" />
          </Field>
          <Field label="Email">
            <Input value={user.email} readOnly disabled />
          </Field>
          <TimezoneField options={zones} defaultValue={user.timezone} />
        </ActionForm>
      </SettingsSection>

      <SettingsSection title="Email verification" description="Verify your email to unlock publishing and notifications.">
        <EmailVerifyNotice verified={!!user.emailVerified} />
      </SettingsSection>
    </>
  );
}
