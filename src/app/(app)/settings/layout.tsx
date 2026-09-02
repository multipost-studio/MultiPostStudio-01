import { SETTINGS_NAV } from "@/lib/nav";
import { SettingsNav } from "./settings-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <h1 className="mb-3 px-2 text-[14px] font-semibold text-[var(--text)]">Settings</h1>
        <SettingsNav items={SETTINGS_NAV} />
      </aside>
      <div className="min-w-0 max-w-2xl">{children}</div>
    </div>
  );
}
