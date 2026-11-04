import { Logo } from "@/components/brand";

/** A bare, focused frame for the screens an outside app sends people to (no app sidebar: nothing here is part of the workspace). */
export default function OAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg-sunken)] px-4 py-10">
      <div className="mx-auto flex w-full max-w-md flex-col items-center">
        <Logo />
        <div className="mt-8 w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-lg)]">{children}</div>
      </div>
    </div>
  );
}
