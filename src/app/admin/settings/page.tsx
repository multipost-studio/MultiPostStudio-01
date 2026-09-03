import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { SettingsForm } from "../settings-client";

export const metadata: Metadata = { title: "Admin · Settings" };

export default async function AdminSettingsPage() {
  const settings = await getSettings();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Site settings</h1>
        <p className="mt-1 text-[14px] text-[var(--text-muted)]">
          Runtime configuration — takes effect immediately, no deploy. Read app-wide via <code>getSettings()</code>.
        </p>
      </div>
      <SettingsForm initial={settings} />
    </div>
  );
}
