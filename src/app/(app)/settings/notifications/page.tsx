import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { SettingsSection } from "../_form";
import { NotificationPrefsForm } from "./form";

export const metadata: Metadata = { title: "Notification settings" };

export default async function NotificationSettingsPage() {
  const user = await requireUser();
  const pref = await db.notificationPref.findUnique({ where: { userId: user.id } });

  return (
    <SettingsSection title="Notifications" description="Choose what reaches your inbox and what stays in-app.">
      <NotificationPrefsForm
        prefs={{
          emailPublish: pref?.emailPublish ?? true,
          emailApproval: pref?.emailApproval ?? true,
          emailMentions: pref?.emailMentions ?? true,
          emailWeeklyDigest: pref?.emailWeeklyDigest ?? true,
          inappAll: pref?.inappAll ?? true,
        }}
      />
    </SettingsSection>
  );
}
