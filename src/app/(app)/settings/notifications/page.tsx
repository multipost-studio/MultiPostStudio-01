import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { parseSettings } from "@/lib/notifications/prefs";
import { env, flags } from "@/lib/env";
import { NotificationPrefsForm } from "./form";
import { PushDevices } from "./push-devices";

export const metadata: Metadata = { title: "Notification settings" };

export default async function NotificationSettingsPage() {
  const user = await requireUser();
  const [pref, devices] = await Promise.all([
    db.notificationPref.findUnique({ where: { userId: user.id } }),
    // Endpoints and keys never leave the server: the list carries only what the screen shows.
    db.pushSubscription.findMany({
      where: { userId: user.id },
      orderBy: { lastUsedAt: "desc" },
      take: 10,
      select: { id: true, label: true, createdAt: true, lastSuccessAt: true },
    }),
  ]);

  return (
    <div>
      <h1 className="text-[20px] font-bold tracking-tight text-[var(--text)]">Notifications</h1>
      <p className="mb-6 mt-0.5 text-[14px] text-[var(--text-muted)]">Choose what reaches you in the app and by email, and when you get reminders.</p>
      <PushDevices
        configured={flags.webPush}
        publicKey={env.VAPID_PUBLIC_KEY ?? null}
        devices={devices.map((d) => ({ id: d.id, label: d.label, createdAt: d.createdAt.toISOString(), lastSuccessAt: d.lastSuccessAt?.toISOString() ?? null }))}
      />
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
