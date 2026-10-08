import type { Metadata } from "next";
import { auth } from "@/auth";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { relativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { SettingsSection } from "../_form";
import { DeviceRow } from "./device-row";
import { SignOutOthersButton } from "./sign-out-others";

export const metadata: Metadata = { title: "Devices" };

/** How many devices to list: the rest are old sign-ins nobody needs to scroll through. */
const LIST_LIMIT = 50;

export default async function DevicesPage() {
  const user = await requireUser();
  const currentId = (await auth())?.deviceId;
  const devices = await db.device.findMany({
    where: { userId: user.id },
    orderBy: { lastSeenAt: "desc" },
    take: LIST_LIMIT,
  });
  const others = devices.filter((d) => !d.revokedAt && d.id !== currentId);

  return (
    <SettingsSection title="Devices & sessions" description="Every browser and phone signed in to your account. Sign out any you don't recognise.">
      {others.length > 0 && currentId && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--bg-sunken)] p-3">
          <p className="text-[13.5px] text-[var(--text-muted)]">
            {others.length} other device{others.length === 1 ? " is" : "s are"} signed in.
          </p>
          <SignOutOthersButton count={others.length} />
        </div>
      )}
      {devices.length === 0 ? (
        <p className="text-[14px] text-[var(--text-muted)]">No device history yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {devices.map((d) => {
            const isCurrent = d.id === currentId;
            return (
              <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-[var(--text)]">
                    {d.label}
                    {isCurrent && <Badge tone="success">This device</Badge>}
                    {d.revokedAt && <span className="text-[13px] font-normal text-[var(--text-subtle)]">(signed out)</span>}
                  </p>
                  <p className="text-[12px] text-[var(--text-subtle)]">
                    {d.ip} · last seen {relativeTime(d.lastSeenAt)}
                  </p>
                </div>
                {!d.revokedAt && <DeviceRow id={d.id} current={isCurrent} />}
              </li>
            );
          })}
        </ul>
      )}
    </SettingsSection>
  );
}
