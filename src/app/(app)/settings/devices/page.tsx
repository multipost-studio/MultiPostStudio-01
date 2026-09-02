import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { relativeTime } from "@/lib/utils";
import { SettingsSection } from "../_form";
import { DeviceRow } from "./device-row";

export const metadata: Metadata = { title: "Devices" };

export default async function DevicesPage() {
  const user = await requireUser();
  const devices = await db.device.findMany({
    where: { userId: user.id },
    orderBy: { lastSeenAt: "desc" },
  });

  return (
    <SettingsSection title="Devices & sessions" description="Sign out of devices you don't recognize.">
      {devices.length === 0 ? (
        <p className="text-[14px] text-[var(--text-muted)]">No device history yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {devices.map((d) => (
            <li key={d.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-[14px] font-medium text-[var(--text)]">
                  {d.label} {d.revokedAt && <span className="text-[var(--text-subtle)]">(signed out)</span>}
                </p>
                <p className="text-[12px] text-[var(--text-subtle)]">
                  {d.ip} · last seen {relativeTime(d.lastSeenAt)}
                </p>
              </div>
              {!d.revokedAt && <DeviceRow id={d.id} />}
            </li>
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}
