import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { Input, Field } from "@/components/ui/input";
import { ActionForm, SettingsSection } from "../_form";
import { changePasswordAction } from "@/app/actions/settings";
import { TwoFactorToggle } from "./two-factor";
import { SignOutOthersButton } from "../devices/sign-out-others";

export const metadata: Metadata = { title: "Security settings" };

export default async function SecuritySettingsPage() {
  const user = await requireUser();
  const currentId = (await auth())?.deviceId;
  const [record, active] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { twoFactorEnabled: true, passwordHash: true } }),
    db.device.findMany({ where: { userId: user.id, revokedAt: null }, orderBy: { lastSeenAt: "desc" }, select: { id: true, label: true } }),
  ]);
  const current = active.find((d) => d.id === currentId);
  const others = active.filter((d) => d.id !== currentId).length;

  return (
    <>
      <SettingsSection title="Password" description="Use a strong, unique password. Changing it signs you out everywhere for safety.">
        <ActionForm action={changePasswordAction} submitLabel="Change password">
          <Field label="Current password (leave blank if you sign in with Google)">
            <Input name="current" type="password" autoComplete="current-password" />
          </Field>
          <Field label="New password" hint="At least 8 characters">
            <Input name="next" type="password" autoComplete="new-password" required minLength={8} />
          </Field>
        </ActionForm>
      </SettingsSection>

      <SettingsSection title="Two-factor authentication" description="Add a second step to sign in.">
        <TwoFactorToggle enabled={record?.twoFactorEnabled ?? false} hasPassword={!!record?.passwordHash} />
      </SettingsSection>

      <SettingsSection title="Sessions" description="Where you are signed in right now.">
        <p className="text-[14px] text-[var(--text)]">
          {current ? (
            <>
              This device: <span className="font-medium">{current.label}</span>.{" "}
            </>
          ) : null}
          {others === 0 ? "No other devices are signed in." : `${others} other device${others === 1 ? " is" : "s are"} signed in.`}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {others > 0 && currentId && <SignOutOthersButton count={others} />}
          <Link href="/settings/devices" className="text-[14px] font-medium text-[var(--primary)] hover:underline">
            See all devices
          </Link>
        </div>
      </SettingsSection>
    </>
  );
}
