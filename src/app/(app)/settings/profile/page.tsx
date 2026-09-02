import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { Input, Select, Field } from "@/components/ui/input";
import { ActionForm, SettingsSection } from "../_form";
import { updateProfileAction } from "@/app/actions/settings";
import { EmailVerifyNotice } from "./email-verify";

export const metadata: Metadata = { title: "Profile settings" };

const TIMEZONES = ["UTC", "America/New_York", "America/Chicago", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Singapore", "Australia/Sydney"];

export default async function ProfileSettingsPage() {
  const user = await requireUser();

  return (
    <>
      <SettingsSection title="Your profile" description="This information is visible to your team.">
        <ActionForm action={updateProfileAction}>
          <Field label="Full name" htmlFor="name">
            <Input id="name" name="name" defaultValue={user.name} required />
          </Field>
          <Field label="Email">
            <Input value={user.email} disabled />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Timezone">
              <Select name="timezone" defaultValue={user.timezone}>
                {TIMEZONES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </Field>
            <Field label="Language">
              <Select name="locale" defaultValue={user.locale}>
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
              </Select>
            </Field>
          </div>
        </ActionForm>
      </SettingsSection>

      <SettingsSection title="Email verification" description="Verify your email to unlock publishing and notifications.">
        <EmailVerifyNotice verified={!!user.emailVerified} />
      </SettingsSection>
    </>
  );
}
