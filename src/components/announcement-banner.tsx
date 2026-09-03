import { getSettings } from "@/lib/settings";

const TONE: Record<string, string> = {
  info: "bg-[var(--info-soft)] text-[var(--info)] border-[var(--info)]",
  warning: "bg-[var(--warning-soft)] text-[var(--warning)] border-[var(--warning)]",
  success: "bg-[var(--success-soft)] text-[var(--success)] border-[var(--success)]",
};

/** Site-wide announcement bar, controlled from /admin/settings. */
export async function AnnouncementBanner() {
  const s = await getSettings();
  if (!s.announcementEnabled || !s.announcementText.trim()) return null;
  return (
    <div
      className={`border-b px-4 py-2 text-center text-[13px] font-medium ${TONE[s.announcementTone] ?? TONE.info}`}
      role="status"
    >
      {s.announcementText}
    </div>
  );
}
