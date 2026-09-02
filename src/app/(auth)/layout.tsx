import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand";
import { getCurrentUser } from "@/lib/session";
import { AuthShowcase } from "./_showcase";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // Real session check (not just cookie presence): a stale/invalid token falls
  // through and the auth forms render, letting the user sign in afresh.
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-[var(--bg-sunken)] p-3 sm:p-4 lg:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-6xl overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)] sm:min-h-[calc(100vh-2rem)] lg:min-h-[calc(100vh-3rem)] lg:grid-cols-[1fr_1.05fr]">
        <div className="relative flex flex-col justify-center px-6 py-16 sm:px-10 lg:px-14">
          <Link href="/" className="absolute left-6 top-7 inline-flex sm:left-10 lg:left-14">
            <Logo />
          </Link>
          <div className="mx-auto w-full max-w-sm">{children}</div>
        </div>
        <AuthShowcase />
      </div>
    </div>
  );
}
