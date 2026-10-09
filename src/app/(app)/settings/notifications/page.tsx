import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { parseSettings } from "@/lib/notifications/prefs";
import { NotificationPrefsForm } from "./form";

export const metadata: Metadata = { title: "Notification settings" };

export default async function NotificationSettingsPage() {
  const user = await requireUser();
  const pref = await db.notificationPref.findUnique({ where: { userId: user.id } });

  return (
    <div>
      <h1 className="text-[20px] font-bold tracking-tight text-[var(--text)]">Notifications</h1>
      <p className="mb-6 mt-0.5 text-[14px] text-[var(--text-muted)]">Choose what reaches you in the app and by email, and when you get reminders.</p>
      <NotificationPrefsForm
        flags={{
          emailPublish: pref?.emailPublish ?? true,
          emailApproval: pref?.emailApproval ?? true,
          emailMentions: pref?.emailMentions ?? true,
          emailWeeklyDigest: pref?.emailWeeklyDigest ?? true,
          emailReports: pref?.emailReports ?? true,
          inappAll: pref?.inappAll ?? true,
        }}
        settings={parseSettings(pref?.settings)}
      />
    </div>
  );
}
